// SUPABASE EDGE FUNCTION: journey-member-portfolio (NEW)
// Opens another student's portfolio for a signed-in TBS member, when the
// member is allowed: their own / their child's, SuperAdmin opened it to the
// TBS community, or the SuperAdmin approved their request (active grant).
//
// Content rules are the same as journey-public: only public, approved
// entries and public evidence; the "about" profile only if profile_public
// (or the viewer is the family / staff).
//
// Deploy: supabase functions deploy journey-member-portfolio --no-verify-jwt
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
      .select('student_id, preferred_name, profile_photo_url, community_closed, community_mode')
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

/* School default for TBS community access ('open' | 'closed'); a student's
 * own setting (community_mode) overrides it. */
async function communityDefault(db: SupabaseClient) {
  const { data } = await db.from('portfolio_settings').select('value').eq('key', 'community_default').maybeSingle();
  return data?.value === 'closed' ? 'closed' : 'open';
}
function communityOpen(profile: Record<string, any>, schoolDefault: string) {
  return (profile.community_mode || schoolDefault) === 'open';
}
// ---- end helpers ----

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const db = serviceClient();
    const member = await memberFromRequest(db, req);
    if (!member) return json({ valid: false, error: 'Please sign in to view portfolios.' }, 401);

    const key = new URL(req.url).searchParams.get('key') || '';
    const row = key ? await resolveKey(db, key) : null;
    if (!row) return json({ valid: false, error: 'This portfolio is not available.' }, 404);

    const studentId = row.student.student_id;
    const grants = await activeGrants(db, member.email);
    const access = accessFor(member, studentId, communityOpen(row.profile, await communityDefault(db)), grants);

    if (access === 'request') {
      return json({ valid: false, access, error: 'You need access to view this portfolio.' }, 403);
    }

    const [student, profile, entries, evidence] = await Promise.all([
      db.from('students')
        .select('student_id,full_name,year_group,profile_photo_url')
        .eq('student_id', studentId).eq('active', true).maybeSingle(),
      db.from('student_journey_profiles')
        .select('preferred_name,headline,about_me,interests,strengths,languages,goals,aspirations,proud_moment,profile_photo_url,banner_image_url,profile_public')
        .eq('student_id', studentId).maybeSingle(),
      db.from('student_journey_entries')
        .select('id,student_id,entry_type,domain,title,event_date,end_date,organisation,level,description,reflection,skills,is_featured,verification_status,is_public,display_order')
        .eq('student_id', studentId).eq('active', true).eq('is_public', true)
        .in('verification_status', ['approved', 'verified'])
        .order('event_date', { ascending: true }),
      db.from('student_journey_evidence')
        .select('id,entry_id,student_id,evidence_type,media_provider,media_url,thumbnail_url,youtube_video_id,file_name,caption,mime_type,sort_order,drive_file_id,is_public,media_role,created_at')
        .eq('student_id', studentId).eq('active', true).eq('is_public', true)
        .order('sort_order', { ascending: true })
    ]);

    const failed = [student, profile, entries, evidence].find(x => x.error);
    if (failed?.error) throw failed.error;

    const showProfile = profile.data?.profile_public || access === 'own' || access === 'staff';

    // CV upgrade (migration 20261005). Tolerant: empty before it runs.
    const [admission, quote, schoolAwards] = await Promise.all([
      db.from('students').select('admission_date').eq('student_id', studentId).maybeSingle(),
      db.from('student_coach_quotes')
        .select('quote_text,team_id,reviewed_by_name,reviewed_by_role,reviewed_at')
        .eq('student_id', studentId).eq('status', 'approved').eq('active', true)
        .order('reviewed_at', { ascending: false }).limit(1),
      // Award Builder (migration 20261006). Tolerant: empty before it runs.
      db.from('award_nominations')
        .select('id,award_id,category,option_label,term,academic_year,focus,reason,reviewed_at,entered_at,entered_by_name,awards(name,show_on_portfolio,options,choose_first)')
        .eq('student_id', studentId).eq('status', 'approved')
        .eq('published_to_portfolio', true)   // migration 20261016: only published awards
        .order('academic_year', { ascending: false })
    ]);

    return json({
      valid: true,
      access,
      grant_expires_at: access === 'granted' ? grants.get(studentId) : null,
      student: student.data
        ? { ...student.data, admission_date: admission.error ? null : admission.data?.admission_date || null }
        : null,
      profile: showProfile ? profile.data : null,
      approvedQuote: quote.error ? null : quote.data?.[0] || null,
      schoolAwards: schoolAwards.error   // (before migration 20261009 the focus column is missing → none shown until it runs)
        ? []
        : (schoolAwards.data || []).filter((row: any) => row.awards?.show_on_portfolio !== false),
      entries: entries.data || [],
      evidence: evidence.data || []
    });
  } catch (error) {
    console.error('journey-member-portfolio', error);
    return json({ valid: false, error: 'This portfolio could not be loaded.' }, 400);
  }
});
