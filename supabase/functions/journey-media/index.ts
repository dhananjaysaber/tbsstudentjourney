// SUPABASE EDGE FUNCTION: journey-media  (UPDATED: resized photos via ?size=, token reuse, browser caching)
// Streams a Drive-stored evidence file to an authorised viewer.
//
// Unchanged from the original:
//   · share-link holders (token) → public evidence of that student
//   · admin / superadmin → everything
//   · the student themself, and linked parents → their own evidence
// NEW (member access model):
//   · any signed-in member → every student's PROFILE PHOTO (galaxy)
//   · any signed-in member → public evidence of a portfolio the SuperAdmin
//     opened to the TBS community, or that they hold an active grant for
//
// Deploy: supabase functions deploy journey-media --no-verify-jwt
//         (keep JWT verification OFF, as today: <img> tags cannot send headers)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function hash(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

async function serviceToken(sa: any) {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const h = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const c = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const der = Uint8Array.from(atob(pem), x => x.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${h}.${c}`))));
  const assertion = `${h}.${c}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'Google authentication failed');
  return j.access_token;
}

/* Reuse the Google access token while it is valid (it lasts an hour), instead
 * of signing in to Google again on every photo. */
let cachedToken: { value: string; expires: number } | null = null;

async function googleToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const value = await freshGoogleToken();
  cachedToken = { value, expires: Date.now() + 50 * 60_000 };
  return value;
}

async function freshGoogleToken() {
  const clientId = Deno.env.get('STUDENT_JOURNEY_GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('STUDENT_JOURNEY_GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('STUDENT_JOURNEY_GOOGLE_REFRESH_TOKEN');

  if (clientId && clientSecret && refreshToken) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || 'Google OAuth refresh failed');
    return j.access_token;
  }

  const raw = Deno.env.get('STUDENT_JOURNEY_GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Google Drive authentication is not configured');
  return serviceToken(JSON.parse(raw));
}

/* NEW: may this signed-in member (not staff / family of the student) view it? */
async function memberMayView(admin: any, email: string, hasAccount: boolean, ev: any) {
  if (!hasAccount) {
    // Parents without an app_users row are members through their links.
    const { data: l } = await admin.from('parent_student_links')
      .select('student_id').ilike('parent_email', email).eq('active', true).limit(1);
    if (!l?.length) return false;
  }

  const { data: p } = await admin.from('student_journey_profiles')
    .select('profile_photo_url, community_visible')
    .eq('student_id', ev.student_id).maybeSingle();

  // Every member sees profile photos in the galaxy.
  if (ev.media_role === 'profile_photo' || p?.profile_photo_url === `evidence:${ev.id}`) {
    return { allowed: true, profilePhoto: true };
  }

  if (ev.is_public !== true) return false;
  if (p?.community_visible) return { allowed: true, profilePhoto: false };

  const { data: g } = await admin.from('portfolio_access_grants')
    .select('id').eq('student_id', ev.student_id).ilike('member_email', email)
    .is('revoked_at', null).gt('expires_at', new Date().toISOString()).limit(1);
  return g?.length ? { allowed: true, profilePhoto: false } : false;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const u = new URL(req.url);
    const evidenceId = u.searchParams.get('evidence') || '';
    const shareToken = u.searchParams.get('token') || '';
    const auth = req.headers.get('Authorization') || '';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: ev, error: ee } = await admin.from('student_journey_evidence')
      .select('*').eq('id', evidenceId).eq('active', true).maybeSingle();
    if (ee) throw ee;
    if (!ev) return json({ error: 'Media not found' }, 404);

    let allowed = false;
    let cacheable = false;

    if (shareToken) {
      const h = await hash(shareToken);
      const { data: s } = await admin.from('student_journey_sharing')
        .select('student_id').eq('student_id', ev.student_id).eq('share_token_hash', h)
        .eq('public_profile_enabled', true).is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()).maybeSingle();
      allowed = !!s && ev.is_public === true;
    } else if (auth.startsWith('Bearer ')) {
      const { data: { user } } = await admin.auth.getUser(auth.slice(7));
      if (user) {
        const email = (user.email || '').toLowerCase();
        const { data: a } = await admin.from('app_users')
          .select('role,student_id,active').ilike('email', email).eq('active', true).maybeSingle();
        const role = String(a?.role || '').toLowerCase();

        allowed = ['admin', 'superadmin'].includes(role) || (role === 'student' && a?.student_id === ev.student_id);

        if (!allowed) {
          const { data: l } = await admin.from('parent_student_links')
            .select('student_id').ilike('parent_email', email)
            .eq('student_id', ev.student_id).eq('active', true).maybeSingle();
          allowed = !!l;
        }

        if (!allowed) {
          const member = await memberMayView(admin, email, !!a, ev);
          if (member) {
            allowed = member.allowed;
            cacheable = member.profilePhoto;
          }
        }
      }
    }

    if (!allowed) return json({ error: 'Not authorized' }, 403);
    if (!ev.drive_file_id) return json({ error: 'This media item is not stored in TBS Drive' }, 400);

    const gt = await googleToken();
    const cacheControl = shareToken ? 'private, max-age=900' : cacheable ? 'private, max-age=3600' : 'private, max-age=3600';

    /* ?size=1600 → a resized copy of a photo (longest side), from Drive's own
     * image service: a few hundred KB instead of the multi-MB original. Falls
     * back to the original file if Drive has no resized copy. */
    const size = Math.min(2400, Math.max(200, Number(u.searchParams.get('size')) || 0));
    if (u.searchParams.get('size') && String(ev.mime_type || 'image/').startsWith('image/')) {
      try {
        const meta = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ev.drive_file_id)}?fields=thumbnailLink,mimeType&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${gt}` } }
        );
        const m = meta.ok ? await meta.json() : null;
        if (m?.thumbnailLink && String(m.mimeType || '').startsWith('image/')) {
          const link = /=s\d+[^/]*$/.test(m.thumbnailLink)
            ? m.thumbnailLink.replace(/=s\d+[^/]*$/, `=s${size}`)
            : `${m.thumbnailLink}=s${size}`;
          const t = await fetch(link, { headers: { Authorization: `Bearer ${gt}` } });
          const type = t.headers.get('content-type') || '';
          if (t.ok && type.startsWith('image/')) {
            return new Response(t.body, {
              status: 200,
              headers: { ...cors, 'content-type': type, 'cache-control': cacheControl }
            });
          }
        }
      } catch {
        /* fall through to the original file */
      }
    }

    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ev.drive_file_id)}?alt=media`,
      { headers: { Authorization: `Bearer ${gt}` } }
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Drive media failed (${r.status}): ${t.slice(0, 180)}`);
    }

    return new Response(r.body, {
      status: 200,
      headers: {
        ...cors,
        'content-type': ev.mime_type || r.headers.get('content-type') || 'application/octet-stream',
        // Only authorised viewers reach this point; let their browser keep it.
        'cache-control': cacheControl
      }
    });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
