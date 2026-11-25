import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { rankByName, scoreName } from './lib/nameSearch';
import { loadStudentSchoolAwards } from './awardsApi';

const nowIso = () => new Date().toISOString();

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getAccount(email) {
  const { data, error } = await supabase
    .from('app_users')
    .select('id,full_name,email,role,student_id,active')
    .ilike('email', email)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getParentChildren(email) {
  const { data: links, error } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .ilike('parent_email', email)
    .eq('active', true);

  if (error) throw error;

  const ids = [
    ...new Set((links || []).map((x) => x.student_id).filter(Boolean)),
  ];

  if (!ids.length) return [];

  const { data, error: studentError } = await supabase
    .from('students')
    .select('student_id,full_name,year_group,profile_photo_url,active')
    .in('student_id', ids)
    .eq('active', true)
    .order('full_name');

  if (studentError) throw studentError;

  return data || [];
}

export async function searchStudents(query) {
  const q = query.trim();

  if (q.length < 2) return [];

  const safe = q.replace(/[,%()]/g, ' ');

  const { data, error } = await supabase
    .from('students')
    .select('student_id,full_name,year_group,profile_photo_url,active')
    .eq('active', true)
    .or(`student_id.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .order('full_name')
    .limit(24);

  if (error) throw error;

  return data || [];
}

export async function loadJourney(studentId) {
  const [student, profile, entries, evidence, sharing] = await Promise.all([
    supabase
      .from('students')
      .select('student_id,full_name,year_group,gender,profile_photo_url,active')
      .eq('student_id', studentId)
      .maybeSingle(),

    supabase
      .from('student_journey_profiles')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle(),

    supabase
      .from('student_journey_entries')
      .select('*')
      .eq('student_id', studentId)
      .eq('active', true)
      .order('event_date', {
        ascending: false,
        nullsFirst: false,
      }),

    supabase
      .from('student_journey_evidence')
      .select('*')
      .eq('student_id', studentId)
      .eq('active', true)
      .order('sort_order', {
        ascending: true,
      })
      .order('created_at', {
        ascending: false,
      }),

    supabase
      .from('student_journey_sharing')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', {
        ascending: false,
      })
      .limit(5),
  ]);

  const failed = [student, profile, entries, evidence, sharing].find(
    (x) => x.error
  );

  if (failed?.error) {
    throw failed.error;
  }

  if (!student.data) {
    throw new Error('We couldn’t find this portfolio. It may have moved.');
  }

  const [admission, approvedQuote, schoolAwards] = await Promise.all([
    loadAdmissionDate(studentId),
    loadApprovedQuote(studentId),
    loadStudentSchoolAwards(studentId),
  ]);

  return {
    student: { ...student.data, admission_date: admission },
    profile: profile.data,
    entries: entries.data || [],
    evidence: evidence.data || [],
    sharing: sharing.data || [],
    approvedQuote,
    schoolAwards,
  };
}

/* ---------- CV upgrade (migration 20261005). Every read here is
 * tolerant: before the migration runs it simply returns nothing. ---------- */

export async function loadAdmissionDate(studentId) {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('admission_date')
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) return null;
    return data?.admission_date || null;
  } catch {
    return null;
  }
}

export async function loadApprovedQuote(studentId) {
  try {
    const { data, error } = await supabase
      .from('student_coach_quotes')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .eq('active', true)
      .order('reviewed_at', { ascending: false })
      .limit(1);
    if (error) return null;
    return data?.[0] || null;
  } catch {
    return null;
  }
}

/* Any quote row for this student that is still open or already approved. */
export async function hasOpenOrApprovedQuote(studentId) {
  const { data, error } = await supabase
    .from('student_coach_quotes')
    .select('id')
    .eq('student_id', studentId)
    .eq('active', true)
    .in('status', ['draft', 'approved'])
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

export async function createQuoteDraft(studentId, draft, email) {
  const { error } = await supabase.from('student_coach_quotes').insert({
    student_id: studentId,
    team_id: draft.team_id,
    quote_text: draft.quote_text,
    source_note: draft.source_note,
    status: 'draft',
    origin: 'app_draft',
    drafted_by_email: email || null,
  });
  // 23505 = a draft already exists (one open draft per student). Fine.
  if (error && error.code !== '23505') throw error;
}

export async function loadQuoteDrafts() {
  const { data, error } = await supabase
    .from('student_coach_quotes')
    .select('*')
    .eq('status', 'draft')
    .eq('active', true)
    .order('drafted_at', { ascending: true });
  if (error) throw error;

  const ids = [...new Set((data || []).map((row) => row.student_id))];
  let students = [];
  if (ids.length) {
    const r = await supabase
      .from('students')
      .select('student_id,full_name,year_group,profile_photo_url')
      .in('student_id', ids);
    if (r.error) throw r.error;
    students = r.data || [];
  }
  const map = Object.fromEntries(students.map((s) => [s.student_id, s]));
  return (data || []).map((row) => ({ ...row, student: map[row.student_id] }));
}

export async function reviewQuote(id, status, quoteText, reviewer) {
  const payload = {
    status,
    reviewed_by_email: reviewer?.email || null,
    reviewed_by_name: reviewer?.full_name || null,
    reviewed_by_role: reviewer?.role || null,
    reviewed_at: nowIso(),
    updated_at: nowIso(),
  };
  if (quoteText != null) payload.quote_text = quoteText;

  if (status === 'approved') {
    // Retire any earlier approved quote so only the newest one prints.
    const { data: row } = await supabase
      .from('student_coach_quotes')
      .select('student_id')
      .eq('id', id)
      .maybeSingle();
    if (row?.student_id) {
      await supabase
        .from('student_coach_quotes')
        .update({ active: false, updated_at: nowIso() })
        .eq('student_id', row.student_id)
        .eq('status', 'approved')
        .neq('id', id);
    }
  }

  const { error } = await supabase.from('student_coach_quotes').update(payload).eq('id', id);
  if (error) throw error;
}

/* Students on Panthers teams who have no draft or approved quote yet. */
export async function studentsNeedingQuotes(limit = 20) {
  const { data: members, error } = await supabase
    .from('team_members')
    .select('student_id')
    .eq('active', true)
    .limit(5000);
  if (error) throw error;
  const ids = [...new Set((members || []).map((row) => row.student_id).filter(Boolean))];
  if (!ids.length) return [];

  const covered = new Set();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: quoteError } = await supabase
      .from('student_coach_quotes')
      .select('student_id,status')
      .eq('active', true)
      .in('student_id', ids.slice(i, i + 300));
    if (quoteError) throw quoteError;
    (data || []).forEach((row) => covered.add(row.student_id));
  }

  const todo = ids.filter((id) => !covered.has(id)).slice(0, limit);
  if (!todo.length) return [];
  const { data: students, error: studentError } = await supabase
    .from('students')
    .select('student_id,full_name')
    .eq('active', true)
    .in('student_id', todo);
  if (studentError) throw studentError;
  return students || [];
}

export async function saveProfile(studentId, values) {
  const payload = {
    ...values,
    student_id: studentId,
    updated_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('student_journey_profiles')
    .upsert(payload, {
      onConflict: 'student_id',
    })
    .select('*')
    .single();

  if (error) throw error;

  return data;
}

export async function saveEntry(studentId, values, id = null) {
  const payload = {
    ...values,
    student_id: studentId,
    updated_at: nowIso(),
  };

  const query = id
    ? supabase.from('student_journey_entries').update(payload).eq('id', id)
    : supabase.from('student_journey_entries').insert(payload);

  const { data, error } = await query.select('*').single();

  if (error) throw error;

  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('student_journey_entries')
    .update({
      active: false,
      deleted_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', id);

  if (error) throw error;
}

/*
  DEVICE UPLOAD
*/

export async function uploadJourneyMedia({
  studentId,

  entryId = null,

  file,

  caption = '',

  bucket = 'journey',

  mediaRole = null,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.access_token) {
    throw new Error('Please sign in again.');
  }

  const body = new FormData();

  body.append('file', file);

  body.append('student_id', studentId);

  if (entryId) {
    body.append('entry_id', entryId);
  }

  body.append('caption', caption);

  body.append('bucket', bucket);

  if (mediaRole) {
    body.append('media_role', mediaRole);
  }

  const { data, error } = await supabase.functions.invoke(
    'journey-drive-upload',
    {
      body,

      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    let message = error.message || 'Upload failed.';

    try {
      const context = error.context;

      if (typeof Response !== 'undefined' && context instanceof Response) {
        const payload = await context
          .clone()
          .json()
          .catch(() => null);

        if (payload?.error) {
          message = payload.error;
        }
      }
    } catch {}

    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'Your upload didn’t finish. Please try again.');
  }

  return data;
}

function youtubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes('youtu.be')) {
      return u.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (u.hostname.includes('youtube.com')) {
      return (
        u.searchParams.get('v') ||
        u.pathname.split('/').filter(Boolean).pop() ||
        ''
      );
    }
  } catch {}

  return '';
}

/*
  EXISTING GOOGLE DRIVE / YOUTUBE LINK
*/

export async function addExternalEvidence({
  studentId,

  entryId,

  url,

  caption = '',

  provider,

  mediaRole = 'journey_media',
}) {
  const clean = String(url || '').trim();

  if (!clean) {
    throw new Error('Paste a valid link first.');
  }

  let mediaProvider = provider;

  let evidenceType = 'link';

  let thumbnail = null;

  let yt = null;

  let driveFileUrl = null;

  if (provider === 'youtube') {
    yt = youtubeId(clean);

    if (!yt) {
      throw new Error('That does not look like a valid YouTube link.');
    }

    mediaProvider = 'youtube';

    evidenceType = 'video';

    thumbnail = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  } else if (provider === 'google_drive') {
    try {
      const u = new URL(clean);

      if (!u.hostname.includes('drive.google.com')) {
        throw new Error();
      }
    } catch {
      throw new Error('That does not look like a valid Google Drive link.');
    }

    mediaProvider = 'google_drive';

    evidenceType = 'link';

    driveFileUrl = clean;
  } else {
    throw new Error('Please use a YouTube or Google Drive link.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('student_journey_evidence')
    .insert({
      student_id: studentId,

      entry_id: entryId,

      evidence_type: evidenceType,

      media_provider: mediaProvider,

      media_url: clean,

      drive_file_url: driveFileUrl,

      thumbnail_url: thumbnail,

      youtube_video_id: yt,

      file_name: caption || null,

      caption,

      media_role: mediaRole,

      sort_order: 50,

      active: true,

      is_public: false,

      uploaded_by: user?.id || null,

      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/*
  JOURNEY COVER
*/

export async function setCoverEvidence(entryId, evidenceId) {
  const { error: resetError } = await supabase
    .from('student_journey_evidence')
    .update({
      sort_order: 20,

      media_role: 'journey_media',

      updated_at: nowIso(),
    })
    .eq('entry_id', entryId)
    .eq('active', true);

  if (resetError) {
    throw resetError;
  }

  const { error } = await supabase
    .from('student_journey_evidence')
    .update({
      sort_order: 0,

      media_role: 'journey_cover',

      updated_at: nowIso(),
    })
    .eq('id', evidenceId);

  if (error) {
    throw error;
  }
}

export async function reviewEntry(entryId, status, note = '') {
  const payload = {
    verification_status: status,

    verification_note: note,

    updated_at: nowIso(),
  };

  if (status === 'approved') {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    payload.verified_by_email = user?.email || null;

    payload.verified_at = nowIso();
  } else {
    payload.verified_at = null;
  }

  const { data, error } = await supabase
    .from('student_journey_entries')
    .update(payload)
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setPublicEntry(entryId, isPublic) {
  if (isPublic) {
    const { data: entry, error: readError } = await supabase
      .from('student_journey_entries')
      .select('verification_status')
      .eq('id', entryId)
      .single();

    if (readError) {
      throw readError;
    }

    if (!['approved', 'verified'].includes(entry.verification_status)) {
      throw new Error('Verify this journey moment before making it public.');
    }
  }

  const { data, error } = await supabase
    .from('student_journey_entries')
    .update({
      is_public: isPublic,

      visibility: isPublic ? 'public' : 'private',

      updated_at: nowIso(),
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  /* The moment's photos follow it, so nobody has to tick each one. */
  await setEntryMediaPublic(entryId, isPublic).catch(() => {});

  return data;
}

/* Make every photo / video of a moment public or private in one go. The
 * ManageBac report and other documents (media_role 'evidence') stay private. */
export async function setEntryMediaPublic(entryId, isPublic) {
  const { error } = await supabase
    .from('student_journey_evidence')
    .update({ is_public: isPublic, updated_at: nowIso() })
    .eq('entry_id', entryId)
    .eq('active', true)
    .in('media_role', ['journey_cover', 'journey_media', 'gallery']);
  if (error) throw error;
}

/* Reuse a photo already in the student's media on another moment: a new
 * evidence row pointing at the same Drive file / link. */
export async function copyEvidenceToEntry(item, entryId, mediaRole = 'journey_media') {
  const { data: me } = await supabase.auth.getUser();
  const fields = [
    'student_id', 'evidence_type', 'media_provider', 'media_url', 'drive_file_id', 'drive_file_url',
    'thumbnail_url', 'youtube_video_id', 'file_name', 'caption', 'mime_type', 'file_size_bytes'
  ];
  const row = Object.fromEntries(fields.filter(f => item[f] !== undefined).map(f => [f, item[f]]));
  const { data, error } = await supabase
    .from('student_journey_evidence')
    .insert({
      ...row,
      entry_id: entryId,
      media_role: mediaRole,
      sort_order: mediaRole === 'journey_cover' ? 0 : 10,
      active: true,
      is_public: false,
      uploaded_by: me?.user?.id || null,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/* Take a photo or file off a moment (kept in Drive, hidden in the app). */
export async function removeEvidence(evidenceId) {
  const { error } = await supabase
    .from('student_journey_evidence')
    .update({ active: false, is_public: false, updated_at: nowIso() })
    .eq('id', evidenceId);
  if (error) throw error;
}

export async function setProfilePublic(studentId, isPublic) {
  const { data, error } = await supabase
    .from('student_journey_profiles')
    .update({
      profile_public: isPublic,

      updated_at: nowIso(),
    })
    .eq('student_id', studentId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setEvidencePublic(evidenceId, isPublic) {
  const { data, error } = await supabase
    .from('student_journey_evidence')
    .update({
      is_public: isPublic,

      updated_at: nowIso(),
    })
    .eq('id', evidenceId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',

    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(digest));
}

function randomToken() {
  const a = new Uint8Array(32);

  crypto.getRandomValues(a);

  return bytesToHex(a);
}

export async function createShare(studentId, expiresAt) {
  const token = randomToken();

  const hash = await sha256Hex(token);

  const { error: deleteError } = await supabase
    .from('student_journey_sharing')
    .delete()
    .eq('student_id', studentId);

  if (deleteError) {
    throw deleteError;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('student_journey_sharing').insert({
    student_id: studentId,

    public_profile_enabled: true,

    public_slug: `${studentId.toLowerCase()}-${hash.slice(0, 8)}`,

    default_visibility: 'selected',

    section_visibility: {
      profile: true,
      journey: true,
      evidence: true,
    },

    allow_search_engines: false,

    share_token_hash: hash,

    expires_at: expiresAt,

    revoked_at: null,

    created_by: user?.id || null,

    published_at: nowIso(),

    created_at: nowIso(),

    updated_at: nowIso(),
  });

  if (error) {
    throw error;
  }

  return token;
}

export async function revokeShare(studentId) {
  const { error } = await supabase
    .from('student_journey_sharing')
    .update({
      revoked_at: nowIso(),

      public_profile_enabled: false,

      updated_at: nowIso(),
    })
    .eq('student_id', studentId);

  if (error) {
    throw error;
  }
}

export async function loadPublicShare(token) {
  const res = await fetch(
    `${supabaseUrl}/functions/v1/journey-public` +
      `?token=${encodeURIComponent(token)}`
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      json.error || `Public portfolio unavailable (${res.status})`
    );
  }

  return json;
}

export async function privateEvidenceBlobUrl(evidenceId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Please sign in again.');
  }

  const res = await fetch(
    `${supabaseUrl}/functions/v1/journey-media` +
      `?evidence=${encodeURIComponent(evidenceId)}`,

    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));

    throw new Error(j.error || 'This photo couldn’t load just now.');
  }

  return URL.createObjectURL(await res.blob());
}

/* Secure photos are fetched once per visit and kept, so the journey,
 * story screen and gallery all reuse the same copy instead of downloading
 * it again. */
const blobCache = new Map();
const cachedBlobUrls = new Set();

export function cachedEvidenceBlobUrl(evidenceId) {
  if (!blobCache.has(evidenceId)) {
    const pending = privateEvidenceBlobUrl(evidenceId).then(
      url => {
        cachedBlobUrls.add(url);
        return url;
      },
      error => {
        blobCache.delete(evidenceId);
        throw error;
      }
    );
    blobCache.set(evidenceId, pending);
  }
  return blobCache.get(evidenceId);
}

export function isCachedBlobUrl(url) {
  return cachedBlobUrls.has(url);
}

/* Start downloading photos before they are shown. */
export function preloadEvidence(list = [], { token, preview } = {}) {
  list.filter(Boolean).forEach(item => {
    const warm = url => {
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    };
    if (item.drive_file_id && token) warm(publicEvidenceUrl(item.id, token));
    else if (item.drive_file_id && preview) cachedEvidenceBlobUrl(item.id).then(warm).catch(() => {});
    else warm(item.thumbnail_url || item.media_url);
  });
}

export function publicEvidenceUrl(evidenceId, token) {
  return (
    `${supabaseUrl}/functions/v1/journey-media` +
    `?evidence=${encodeURIComponent(evidenceId)}` +
    `&token=${encodeURIComponent(token)}`
  );
}

export async function loadPendingEntries() {
  const { data, error } = await supabase
    .from('student_journey_entries')
    .select('*')
    // Students' moments are saved as "submitted"; older rows may say "pending".
    .in('verification_status', ['submitted', 'pending'])
    .eq('active', true)
    .order('submitted_at', {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const ids = [...new Set((data || []).map((x) => x.student_id))];

  let students = [];

  if (ids.length) {
    const r = await supabase
      .from('students')
      .select('student_id,full_name,year_group')
      .in('student_id', ids);

    if (r.error) {
      throw r.error;
    }

    students = r.data || [];
  }

  const map = Object.fromEntries(students.map((s) => [s.student_id, s]));

  return (data || []).map((e) => ({
    ...e,

    student: map[e.student_id],
  }));
}

/* =========================================================
   TBS STUDENT PORTFOLIO DIRECTORY + ACCESS (landing page)
   Visitors get initials only; signed-in members get names, photos and
   access; only the SuperAdmin reviews requests and grants access.
========================================================= */

async function functionHeaders(extra = {}) {
  const { data } = (await supabase?.auth.getSession()) || { data: {} };
  const token = data?.session?.access_token || supabaseAnonKey;
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...extra
  };
}

export async function getSignedInSession() {
  const { data } = (await supabase?.auth.getSession()) || { data: {} };
  return data?.session || null;
}

/* { mode: 'visitor' | 'member', viewer?, people[] } */
export async function loadDirectory() {
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-directory`, {
    headers: await functionHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'The sky is resting for a moment. Please try again shortly.');
  }
  return {
    mode: json.mode || 'visitor',
    viewer: json.viewer || null,
    total: json.total || (json.people || []).length,
    people: json.people || []
  };
}

/* Workspace "Browse portfolios": server-side search (max 24 results). */
export async function searchDirectory({ q = '', year = '' } = {}) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (year) params.set('year', year);
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-directory?${params}`, {
    headers: await functionHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || 'Search is taking a short break. Please try again in a moment.');

  let people = json.people || [];
  let total = json.total || people.length;
  // Older server versions ignore the search and return everyone — filter here so
  // results always match what was typed.
  if (json.mode !== 'search') {
    const inYear = year ? people.filter(person => person.yearGroup === year) : people;
    const ranked = q.trim() ? rankByName(inYear, q, person => person.name, Infinity) : inYear;
    total = ranked.length;
    people = ranked.slice(0, 24);
  } else if (q.trim()) {
    // Keep the best matches first, whatever order the server used.
    people = rankByName(people, q, person => person.name, Infinity).concat(
      people.filter(person => scoreName(person.name, q) === null)
    );
  }
  return { total, people };
}

export async function loadYearGroups() {
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-directory?years=1`, {
    headers: await functionHeaders()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || 'Year groups are loading. Please try again in a moment.');
  return json.years || [];
}

export async function submitAccessRequest(payload) {
  const res = await fetch(`${supabaseUrl}/functions/v1/journey-access-request`, {
    method: 'POST',
    headers: await functionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || 'Your request could not be sent. Please try again.');
  }
  return json;
}

export async function loadMemberPortfolio(key) {
  const res = await fetch(
    `${supabaseUrl}/functions/v1/journey-member-portfolio?key=${encodeURIComponent(key)}`,
    { headers: await functionHeaders() }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.valid) {
    const error = new Error(json.error || 'This portfolio could not be opened.');
    error.status = res.status;
    error.access = json.access;
    throw error;
  }
  return json;
}

/* SuperAdmin inbox (RLS returns rows only to the SuperAdmin). */
export async function loadAccessRequests() {
  const { data, error } = await supabase
    .from('portfolio_access_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw error;

  const rows = data || [];
  const ids = [...new Set(rows.map(row => row.student_id).filter(Boolean))];
  let names = new Map();
  let grants = new Map();

  if (ids.length) {
    const [{ data: students }, { data: grantRows }] = await Promise.all([
      supabase.from('students').select('student_id,full_name,year_group').in('student_id', ids),
      supabase
        .from('portfolio_access_grants')
        .select('*')
        .in('request_id', rows.map(row => row.id))
    ]);
    names = new Map((students || []).map(s => [s.student_id, s]));
    grants = new Map((grantRows || []).map(g => [g.request_id, g]));
  }

  return rows.map(row => ({
    ...row,
    student: names.get(row.student_id) || null,
    grant: grants.get(row.id) || null
  }));
}

/* SuperAdmin: match a request from the sign-in page to a student. */
export async function matchAccessRequest(requestId, studentId) {
  const { error } = await supabase
    .from('portfolio_access_requests')
    .update({ student_id: studentId })
    .eq('id', requestId)
    .is('student_id', null);
  if (error) throw error;
}

export async function countPendingAccessRequests() {
  const { count, error } = await supabase
    .from('portfolio_access_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count || 0;
}

export async function reviewAccessRequest(request, status, { grantDays = 30 } = {}) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('portfolio_access_requests')
    .update({
      status,
      reviewed_by: user?.id || null,
      reviewed_at: nowIso()
    })
    .eq('id', request.id);

  if (error) throw error;

  /* Approving a member opens the portfolio to them for a limited time. */
  if (status === 'approved' && request.requester_type === 'member') {
    const expires = new Date();
    expires.setDate(expires.getDate() + grantDays);

    const { error: grantError } = await supabase.from('portfolio_access_grants').insert({
      student_id: request.student_id,
      member_email: String(request.requester_email).toLowerCase(),
      request_id: request.id,
      granted_by: user?.id || null,
      expires_at: expires.toISOString()
    });

    if (grantError) throw grantError;
  }
}

export async function revokeAccessGrant(grantId) {
  const { error } = await supabase
    .from('portfolio_access_grants')
    .update({ revoked_at: nowIso() })
    .eq('id', grantId);
  if (error) throw error;
}

/* SuperAdmin: close (or re-open) a portfolio to other signed-in members.
 * Portfolios are open by default. */
export async function setCommunityClosed(studentId, closed) {
  const { data, error } = await supabase
    .from('student_journey_profiles')
    .upsert(
      { student_id: studentId, community_closed: closed, updated_at: nowIso() },
      { onConflict: 'student_id' }
    )
    .select('community_closed')
    .single();

  if (error) throw error;
  if (Boolean(data?.community_closed) !== Boolean(closed)) {
    throw new Error('Only the SuperAdmin can change TBS community access.');
  }
  return data;
}
