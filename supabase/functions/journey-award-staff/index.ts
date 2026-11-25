// SUPABASE EDGE FUNCTION: journey-award-staff (NEW · Award Builder)
// SuperAdmin / Admin add or update the staff who enter school awards:
// Key Stage Office, Heads of Year, Tutors and Teachers.
//
//   POST { email, full_name, active, roles: [{ award_role, class_names[], year_groups[], subjects[] }], roles_mode }
//   POST { people: [ …same shape… ], roles_mode }   ← import / bulk assign many at once
//
// One person can hold several roles (e.g. Tutor of Yr8A + Teacher of Science + Head of Year 7).
// roles_mode: 'merge' (default) adds; 'replace' sets the full list; 'remove' removes.
// People can be imported with no roles and given them afterwards.
//
// It makes sure the person can sign in with the usual 6-digit email code:
//   · creates their sign-in (Supabase Auth user) if they have none, and
//   · adds an app_users row with role "Staff" if they have none.
// Anyone who already has an account (e.g. a Panthers coach) keeps their
// role — the award role is stored separately in award_staff.
//
// Deploy: supabase functions deploy journey-award-staff --no-verify-jwt
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false }
  });
}

const ROLES = ['key_stage_office', 'head_of_year', 'class_teacher', 'subject_teacher'];
const CLASS_ROLES = ['class_teacher', 'subject_teacher'];
const cleanList = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))].slice(0, 60)
    : [];

async function caller(db: SupabaseClient, req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const { data } = await db.auth.getUser(auth.slice(7));
  const email = data?.user?.email?.toLowerCase();
  if (!email) return null;
  const { data: account } = await db
    .from('app_users')
    .select('full_name, role, active')
    .ilike('email', email)
    .eq('active', true)
    .maybeSingle();
  const role = String(account?.role || '').toLowerCase();
  if (!['admin', 'superadmin'].includes(role)) return null;
  return { email, name: account?.full_name || email };
}

/* All existing sign-ins, loaded once per request (Auth has no lookup by email). */
async function authUsersByEmail(db: SupabaseClient) {
  const map = new Map<string, { id: string }>();
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach(u => u.email && map.set(u.email.toLowerCase(), { id: u.id }));
    if (data.users.length < 1000) break;
  }
  return map;
}

type Person = Record<string, unknown>;

type RoleIn = { award_role?: string; year_groups?: unknown; class_names?: unknown; subjects?: unknown };

/* Save a person: their sign-in, a "Staff" account if they have none, the
 * award_staff record, and (optionally) their roles.
 *   roles_mode 'merge'   add roles / add classes to roles they already have (import, bulk assign)
 *   roles_mode 'replace' the given roles become their complete set (edit one person)
 *   roles_mode 'remove'  remove the given roles (bulk remove) */
async function savePerson(
  db: SupabaseClient,
  me: { email: string },
  input: Person,
  authUsers: Map<string, { id: string }>,
  rolesMode: 'merge' | 'replace' | 'remove' = 'merge'
) {
  const email = String(input.email || '').trim().toLowerCase();
  const active = input.active !== false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email.');

  const { data: existing } = await db.from('award_staff').select('id, full_name').ilike('email', email).maybeSingle();
  const fullName = String(input.full_name || existing?.full_name || '').trim().slice(0, 120);
  if (!fullName) throw new Error('Please enter the person’s name.');

  const roles: RoleIn[] = Array.isArray(input.roles) ? (input.roles as RoleIn[]) : [];
  for (const r of roles) {
    if (!ROLES.includes(String(r.award_role))) throw new Error('Award role must be Key Stage Office, Head of Year, Tutor or Teacher.');
  }
  const created: string[] = [];

  if (active) {
    // 1. Sign-in (Auth user)
    let authUser = authUsers.get(email);
    if (!authUser) {
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
      if (error && !/already/i.test(error.message)) throw error;
      if (data?.user) {
        authUser = { id: data.user.id };
        authUsers.set(email, authUser);
      }
      created.push('sign-in');
    }

    // 2. app_users row (role "Staff" only for people who have none)
    const { data: account, error: accountError } = await db
      .from('app_users')
      .select('id, role, active')
      .ilike('email', email)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      const base = { email, full_name: fullName, role: 'Staff', active: true };
      let { error } = await db.from('app_users').insert(base);
      // Some app_users tables key the row on the sign-in id: retry with it.
      if (error && authUser?.id && /null value|violates not-null|"id"|user_id/i.test(error.message)) {
        ({ error } = await db.from('app_users').insert({ ...base, id: authUser.id }));
        if (error && /column/i.test(error.message)) {
          ({ error } = await db.from('app_users').insert({ ...base, auth_user_id: authUser.id }));
        }
      }
      if (error) throw error;
      created.push('Staff account');
    } else if (!account.active && String(account.role).toLowerCase() === 'staff') {
      await db.from('app_users').update({ active: true }).eq('id', account.id);
    }
  } else {
    // Switching off only deactivates accounts this screen created ("Staff").
    await db.from('app_users').update({ active: false }).ilike('email', email).ilike('role', 'staff');
  }

  // 3. The person
  const personRow = { email, full_name: fullName, active, updated_at: new Date().toISOString() };
  const saved = existing
    ? await db.from('award_staff').update(personRow).eq('id', existing.id).select().single()
    : await db.from('award_staff').insert({ ...personRow, created_by: me.email }).select().single();
  if (saved.error) throw saved.error;
  const staffId = saved.data.id;

  // 4. Roles
  if (roles.length || rolesMode === 'replace') {
    const { data: current, error: rolesError } = await db.from('award_staff_roles').select('*').eq('staff_id', staffId);
    if (rolesError) throw new Error('Run migration 20261008_award_staff_roles.sql first (one person, several roles).');
    const byRole = new Map((current || []).map(r => [r.award_role, r]));

    if (rolesMode === 'remove') {
      const ids = roles.map(r => byRole.get(String(r.award_role))?.id).filter(Boolean);
      if (ids.length) await db.from('award_staff_roles').delete().in('id', ids);
    } else {
      for (const r of roles) {
        const role = String(r.award_role);
        const years = cleanList(r.year_groups);
        const classes = cleanList(r.class_names);
        const subjects = cleanList(r.subjects);
        const had = byRole.get(role);
        const row = {
          staff_id: staffId,
          award_role: role,
          year_groups: CLASS_ROLES.includes(role) ? [] : rolesMode === 'merge' && had ? [...new Set([...had.year_groups, ...years])] : years,
          class_names: CLASS_ROLES.includes(role) ? (rolesMode === 'merge' && had ? [...new Set([...had.class_names, ...classes])] : classes) : [],
          subjects: rolesMode === 'merge' && had ? [...new Set([...had.subjects, ...subjects])] : subjects,
          updated_at: new Date().toISOString()
        };
        const res = had
          ? await db.from('award_staff_roles').update(row).eq('id', had.id)
          : await db.from('award_staff_roles').insert(row);
        if (res.error) throw res.error;
      }
      if (rolesMode === 'replace') {
        const keep = new Set(roles.map(r => String(r.award_role)));
        const drop = (current || []).filter(r => !keep.has(r.award_role)).map(r => r.id);
        if (drop.length) await db.from('award_staff_roles').delete().in('id', drop);
      }
    }
  }

  return { staff: saved.data, created };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  try {
    const db = serviceClient();
    const me = await caller(db, req);
    if (!me) return json({ ok: false, error: 'Only an Admin or the SuperAdmin can manage award staff.' }, 403);

    const body = await req.json().catch(() => ({}));
    const authUsers = await authUsersByEmail(db);

    // Import: many people at once; each succeeds or fails on its own.
    const mode = ['merge', 'replace', 'remove'].includes(body.roles_mode) ? body.roles_mode : 'merge';

    if (Array.isArray(body.people)) {
      const people = body.people.slice(0, 500);
      const results = [];
      for (const person of people) {
        try {
          const saved = await savePerson(db, me, person, authUsers, mode);
          results.push({ email: saved.staff.email, ok: true, created: saved.created });
        } catch (error) {
          results.push({ email: String(person?.email || ''), ok: false, error: (error as Error)?.message || 'Could not save.' });
        }
      }
      return json({ ok: true, results });
    }

    const saved = await savePerson(db, me, body, authUsers, mode);
    return json({ ok: true, ...saved });
  } catch (error) {
    console.error('journey-award-staff', error);
    return json({ ok: false, error: (error as Error)?.message || 'Could not save this person.' }, 400);
  }
});
