// SUPABASE EDGE FUNCTION: journey-access-request
// Ask the SuperAdmin for access to a portfolio.
//  · Members (signed in): one click — identity comes from their account.
//  · Visitors: name, email, relationship, reason and (optionally) the
//    student's name if they know it. Rate-limited, with a bot honeypot.
//
// Deploy: supabase functions deploy journey-access-request --no-verify-jwt
// ---- helpers (self-contained so it can be pasted into the dashboard editor) ----
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }
  });
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Opaque public key for a student — the admission number never leaves the server. */
async function studentKey(studentId: string) {
  const salt = Deno.env.get('DIRECTORY_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return (await sha256Hex(`${salt}:${studentId}`)).slice(0, 20);
}

function initialsOf(name: string) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('') || '•';
}

/* Every active student in the app. A Student Journey profile is optional:
 * students without one still appear (their portfolio shows "in progress"). */
async function directoryStudents(db: SupabaseClient) {
  const students: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('students')
      .select('student_id, full_name, year_group')
      .eq('active', true)
      .order('student_id')
      .range(from, from + 999);
    if (error) throw error;
    students.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const profiles: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('student_journey_profiles')
      .select('student_id, preferred_name, profile_photo_url, community_closed')
      .range(from, from + 999);
    if (error) throw error;
    profiles.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const profileById = new Map(profiles.map(p => [p.student_id, p]));
  return students.map(student => ({
    student,
    profile: (profileById.get(student.student_id) || {}) as Record<string, any>
  }));
}

async function resolveKey(db: SupabaseClient, key: string) {
  for (const row of await directoryStudents(db)) {
    if ((await studentKey(row.student.student_id)) === key) return row;
  }
  return null;
}

type Member = {
  userId: string;
  email: string;
  name: string;
  role: string;
  studentId: string | null;
  children: string[];
  isStaffAdmin: boolean;
};

/* A member is anyone who can sign in to the app: an active app_users
 * account (staff / student) or a parent with an active link. */
async function memberFromRequest(db: SupabaseClient, req: Request): Promise<Member | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;

  const { data } = await db.auth.getUser(auth.slice(7));
  const user = data?.user;
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const [{ data: account }, { data: links }] = await Promise.all([
    db.from('app_users').select('full_name, role, student_id, active')
      .ilike('email', email).eq('active', true).maybeSingle(),
    db.from('parent_student_links').select('student_id')
      .ilike('parent_email', email).eq('active', true)
  ]);

  const children = (links || []).map(l => l.student_id).filter(Boolean);
  if (!account && !children.length) return null;

  const role = String(account?.role || 'parent').toLowerCase();
  return {
    userId: user.id,
    email,
    name: account?.full_name || user.email,
    role,
    studentId: account?.student_id || null,
    children,
    isStaffAdmin: ['admin', 'superadmin'].includes(role)
  };
}

async function activeGrants(db: SupabaseClient, email: string) {
  const { data } = await db
    .from('portfolio_access_grants')
    .select('student_id, expires_at')
    .ilike('member_email', email)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());
  return new Map((data || []).map(g => [g.student_id, g.expires_at]));
}

/* 'staff' | 'own' | 'community' | 'granted' | 'request'
 * Portfolios are open to every signed-in member unless the SuperAdmin
 * closed them (community_closed). */
function accessFor(member: Member, sid: string, communityOpen: boolean, grants: Map<string, string>) {
  if (member.isStaffAdmin) return 'staff';
  if (member.studentId === sid || member.children.includes(sid)) return 'own';
  if (communityOpen) return 'community';
  if (grants.has(sid)) return 'granted';
  return 'request';
}
// ---- end helpers ----

const RELATIONSHIPS = [
  'Parent / guardian',
  'Family member',
  'University / admissions',
  'Employer / internship',
  'Coach / mentor',
  'Teacher',
  'Other'
];

const clean = (value: unknown, max: number) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function hashIp(ip: string) {
  return (await sha256Hex(`ip:${ip}:${Deno.env.get('DIRECTORY_SALT') || ''}`)).slice(0, 32);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (clean(body.website, 200)) return json({ ok: true }); // honeypot

  const key = clean(body.key, 40);

  try {
    const db = serviceClient();
    const member = await memberFromRequest(db, req);

    /* From the sign-in page: no student chosen yet. Only visitors send these;
     * the typed name is kept for the SuperAdmin to match. Nothing about
     * whether the student exists is ever sent back. */
    let studentId: string | null = null;
    if (key) {
      const row = await resolveKey(db, key);
      if (!row) return json({ error: 'This portfolio is no longer available.' }, 404);
      studentId = row.student.student_id;
    } else if (member) {
      return json({ error: 'Missing portfolio.' }, 400);
    } else if (clean(body.studentName, 120).length < 2) {
      return json({ error: 'Please enter the student’s name.' }, 400);
    }

    let name: string;
    let email: string;
    let relationship: string;
    let hint: string | null = null;

    if (member) {
      name = member.name;
      email = member.email;
      relationship = `TBS ${member.role}`;
    } else {
      name = clean(body.name, 120);
      email = clean(body.email, 200).toLowerCase();
      relationship = RELATIONSHIPS.includes(clean(body.relationship, 60))
        ? clean(body.relationship, 60)
        : 'Other';
      hint = clean(body.studentName, 120) || null;
      if (name.length < 2) return json({ error: 'Please enter your full name.' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ error: 'Please enter a valid email address.' }, 400);
      }
    }

    const message = String(body.message ?? '').trim().slice(0, 1000) || null;

    // Rate limits: per email (5/day) and, for visitors, per network (12/hour).
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const ipHash = await hashIp(ip);
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const { count: byEmail } = await db.from('portfolio_access_requests')
      .select('id', { count: 'exact', head: true })
      .ilike('requester_email', email).gte('created_at', dayAgo);
    let byIp = 0;
    if (!member) {
      const { count } = await db.from('portfolio_access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('request_ip_hash', ipHash).gte('created_at', hourAgo);
      byIp = count || 0;
    }
    if ((byEmail || 0) >= (member ? 20 : 5) || byIp >= 12) {
      return json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    let openQuery = db.from('portfolio_access_requests')
      .select('id').ilike('requester_email', email).eq('status', 'pending');
    openQuery = studentId
      ? openQuery.eq('student_id', studentId)
      : openQuery.is('student_id', null).ilike('student_hint', (hint || '').replace(/[%_\\]/g, m => `\\${m}`));
    const { data: open } = await openQuery.limit(1);
    if (open?.length) return json({ ok: true, duplicate: true });

    const { error } = await db.from('portfolio_access_requests').insert({
      student_id: studentId,
      requester_type: member ? 'member' : 'visitor',
      requester_user_id: member?.userId || null,
      requester_name: name,
      requester_email: email,
      relationship,
      message,
      student_hint: hint,
      request_ip_hash: member ? null : ipHash
    });
    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    console.error('journey-access-request', error);
    return json({ error: 'Your request could not be sent. Please try again.' }, 500);
  }
});
