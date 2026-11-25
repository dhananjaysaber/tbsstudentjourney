// SUPABASE EDGE FUNCTION: journey-first-signin
// Called by the portfolio's sign-in screen just before it sends a code.
// If the email belongs to someone already in the shared records but they
// have never signed in, their Supabase sign-in is created here (confirmed,
// no password). Nothing else changes: no project settings, no hooks, and
// the Panthers app is not affected.
//
// Allowed: active app_users (SuperAdmin, Admin, Coach, Student, Parent…),
//          active students (school_email), active parent links,
//          active award staff (KSO, Head of Year, Tutor, Subject Teacher).
// Anyone else gets { ok:false, reason:'not_on_school_list' }.
//
// Deploy: supabase functions deploy journey-first-signin --no-verify-jwt
//   (Dashboard: Edge Functions → Deploy a new function → name
//    journey-first-signin → paste this file → turn OFF "Verify JWT".)
import { createClient } from 'npm:@supabase/supabase-js@2';

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  let email = '';
  try {
    const body = await req.json();
    email = String(body?.email || '').trim().toLowerCase();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }
  if (!EMAIL.test(email) || email.length > 200) return json({ ok: false, reason: 'bad_request' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Is this person in the shared records? (ilike without wildcards = case-insensitive equals)
  const safe = email.replace(/[\\%_]/g, m => `\\${m}`);
  const checks = await Promise.all([
    db.from('app_users').select('email', { count: 'exact', head: true }).ilike('email', safe).eq('active', true),
    db.from('students').select('student_id', { count: 'exact', head: true }).ilike('school_email', safe).eq('active', true),
    db.from('parent_student_links').select('student_id', { count: 'exact', head: true }).ilike('parent_email', safe).eq('active', true),
    db.from('award_staff').select('id', { count: 'exact', head: true }).ilike('email', safe).eq('active', true)
  ]);
  const known = checks.some(r => !r.error && (r.count || 0) > 0);
  if (!known) return json({ ok: false, reason: 'not_on_school_list' });

  // Create the sign-in if it doesn't exist yet. "Already registered" is fine.
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already|exists|registered/i.test(error.message || '')) {
    console.error('journey-first-signin createUser', error.message);
    return json({ ok: false, reason: 'create_failed' }, 500);
  }
  return json({ ok: true, created: !error });
});
