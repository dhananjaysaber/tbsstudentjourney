// SUPABASE EDGE FUNCTION: journey-directory
// Data for the TBS Student Portfolio landing page and workspace browse.
//
//  GET /journey-directory
//    Landing page: a RANDOM sample of up to 150 students (never all 900).
//      · Visitors (no sign-in): initials + anonymous key ONLY.
//      · Members: name, year group, profile photo id, access on click.
//  GET /journey-directory?q=<name>&year=<year group>      (members only)
//    Workspace "Browse portfolios": server-side search, max 24 results.
//  GET /journey-directory?years=1                          (members only)
//    The list of year groups for the filter dropdown.
//
// Deploy: supabase functions deploy journey-directory --no-verify-jwt
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
/* ---------- name search: accent/order-insensitive, typo-tolerant ---------- */
function normaliseName(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function closeEnough(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length] <= max;
}

/* Lower is better; null = no match. */
function scoreName(name: string, query: string): number | null {
  const n = normaliseName(name);
  const q = normaliseName(query);
  if (!q) return null;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const parts = n.split(' ');
  let score = 2;
  for (const word of q.split(' ')) {
    if (parts.some(part => part.startsWith(word))) continue;
    if (n.includes(word)) {
      score += 1;
      continue;
    }
    const max = word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0;
    if (max && parts.some(part => closeEnough(part.slice(0, word.length + max), word, max) || closeEnough(part, word, max))) {
      score += 3;
      continue;
    }
    return null;
  }
  return score;
}

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

/* "Yr6C" / "Year 6" → "Year 6"; "Reception A" → "Reception". */
function yearOf(yg: string) {
  const t = String(yg || '').trim();
  const m = t.match(/^(?:yr|year)\s*(\d+)/i);
  if (m) return `Year ${m[1]}`;
  if (/^reception/i.test(t)) return 'Reception';
  if (/^nursery/i.test(t)) return 'Nursery';
  return t;
}
function yearRank(y: string) {
  if (/^nursery/i.test(y)) return -2;
  if (/^reception/i.test(y)) return -1;
  return Number(y.match(/\d+/)?.[0] ?? 999);
}
// ---- end helpers ----

const SAMPLE_SIZE = 150;
const SEARCH_LIMIT = 24;

function evidenceIdFrom(ref: unknown) {
  const value = String(ref || '');
  return value.startsWith('evidence:') ? value.slice(9) : '';
}

function shuffle<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* Member-facing rows for a subset of students (photos looked up only for them). */
async function memberRows(db: SupabaseClient, member: Member, rows: Array<{ student: any; profile: any }>) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.student.student_id);
  const grants = await activeGrants(db, member.email);

  const [{ data: pendingRows }, { data: photos }] = await Promise.all([
    db.from('portfolio_access_requests').select('student_id')
      .eq('requester_type', 'member').ilike('requester_email', member.email)
      .eq('status', 'pending').in('student_id', ids),
    db.from('student_journey_evidence').select('id, student_id, created_at')
      .in('student_id', ids).eq('active', true).eq('media_role', 'profile_photo')
      .order('created_at', { ascending: false })
  ]);

  const pending = new Set((pendingRows || []).map(r => r.student_id));
  const photoByStudent = new Map<string, string>();
  for (const p of photos || []) {
    if (!photoByStudent.has(p.student_id)) photoByStudent.set(p.student_id, p.id);
  }

  return Promise.all(
    rows.map(async ({ student, profile }) => {
      const sid = student.student_id;
      const access = accessFor(member, sid, !profile.community_closed, grants);
      const name = student.full_name || profile.preferred_name || 'Student';
      return {
        key: await studentKey(sid),
        name,
        initials: initialsOf(name),
        yearGroup: student.year_group || '',
        photoId: evidenceIdFrom(profile.profile_photo_url) || photoByStudent.get(sid) || null,
        access,
        // Only people allowed to edit this portfolio receive its id (for the Edit button).
        studentId: access === 'own' || access === 'staff' ? sid : null,
        pending: access === 'request' && pending.has(sid),
        grantExpires: access === 'granted' ? grants.get(sid) : null
      };
    })
  );
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const db = serviceClient();
    const url = new URL(req.url);
    const member = await memberFromRequest(db, req);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const year = (url.searchParams.get('year') || '').trim().slice(0, 40);
    const wantsYears = url.searchParams.get('years') === '1';
    const searching = Boolean(q || year);

    /* ---------- members only: year list + search ---------- */
    if (wantsYears || searching) {
      if (!member) return json({ ok: false, error: 'Please sign in.' }, 401);

      /* Year Group holds the class (e.g. "Yr6C"); the filter lists years
       * ("Year 6") followed by their classes, and either can be chosen. */
      if (wantsYears) {
        const years = new Set<string>();
        const classes = new Set<string>();
        for (const row of await directoryStudents(db)) {
          const yg = String(row.student.year_group || '').trim();
          if (!yg) continue;
          years.add(yearOf(yg));
          if (yearOf(yg) !== yg) classes.add(yg);
        }
        const byNum = (a: string, b: string) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        const ordered = [...years].sort((a, b) => yearRank(a) - yearRank(b) || byNum(a, b));
        const sorted = ordered.flatMap(y =>
          [y, ...[...classes].filter(c => yearOf(c) === y).sort(byNum)]
        );
        return json({ ok: true, years: sorted });
      }

      const matches = (await directoryStudents(db))
        .filter(({ student }) => {
          if (!year) return true;
          const yg = String(student.year_group || '').trim();
          return yg === year || yearOf(yg) === year;
        })
        .map(row => {
          const names = [row.student.full_name, row.profile.preferred_name].filter(Boolean);
          const scores = q
            ? names.map(name => scoreName(String(name), q)).filter((x): x is number => x !== null)
            : [0];
          return { row, score: scores.length ? Math.min(...scores) : null };
        })
        .filter(entry => entry.score !== null)
        .sort(
          (a, b) =>
            (a.score as number) - (b.score as number) ||
            String(a.row.student.full_name).localeCompare(String(b.row.student.full_name))
        )
        .map(entry => entry.row);

      const people = await memberRows(db, member, matches.slice(0, SEARCH_LIMIT));
      return json({ ok: true, mode: 'search', total: matches.length, people });
    }

    /* ---------- landing page: random sample ---------- */
    const all = await directoryStudents(db);
    const sample = shuffle(all).slice(0, SAMPLE_SIZE);

    if (!member) {
      const people = await Promise.all(
        sample.map(async ({ student, profile }) => ({
          key: await studentKey(student.student_id),
          initials: initialsOf(student.full_name || profile.preferred_name)
        }))
      );
      return json({ ok: true, mode: 'visitor', total: all.length, people });
    }

    const people = await memberRows(db, member, sample);
    return json({
      ok: true,
      mode: 'member',
      total: all.length,
      viewer: { name: member.name, role: member.role },
      people
    });
  } catch (error) {
    console.error('journey-directory', error);
    return json({ ok: false, error: 'Directory unavailable' }, 500);
  }
});
