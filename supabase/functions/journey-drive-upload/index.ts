import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'content-type': 'application/json'
    }
  });

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/*
 * GOOGLE AUTH
 *
 * Preferred:
 *   School Google OAuth refresh token.
 *
 * Fallback:
 *   Existing service account.
 */
async function googleAccessToken() {
  const clientId = Deno.env.get('STUDENT_JOURNEY_GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('STUDENT_JOURNEY_GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('STUDENT_JOURNEY_GOOGLE_REFRESH_TOKEN');

  if (clientId && clientSecret && refreshToken) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error_description ||
          result.error ||
          'Google OAuth refresh failed'
      );
    }

    if (!result.access_token) {
      throw new Error('Google did not return an access token.');
    }

    return result.access_token as string;
  }

  /*
   * SERVICE ACCOUNT FALLBACK
   */
  const raw = Deno.env.get('STUDENT_JOURNEY_GOOGLE_SERVICE_ACCOUNT_JSON');

  if (!raw) {
    throw new Error('Google Drive authentication is not configured.');
  }

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();

  const header = b64url(
    enc.encode(
      JSON.stringify({
        alg: 'RS256',
        typ: 'JWT'
      })
    )
  );

  const claim = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
      })
    )
  );

  const pem = String(sa.private_key || '').replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,
    ''
  );

  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      enc.encode(`${header}.${claim}`)
    )
  );

  const assertion = `${header}.${claim}.${b64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error_description ||
        result.error ||
        'Google service-account authentication failed'
    );
  }

  if (!result.access_token) {
    throw new Error('Google service-account authentication returned no token.');
  }

  return result.access_token as string;
}

function esc(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(
  accessToken: string,
  parentId: string,
  name: string
) {
  const q =
    `mimeType='application/vnd.google-apps.folder' ` +
    `and trashed=false ` +
    `and '${esc(parentId)}' in parents ` +
    `and name='${esc(name)}'`;

  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({
        q,
        fields: 'files(id,name)',
        pageSize: '10',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Drive folder lookup failed');
  }

  return result.files?.[0]?.id || null;
}

async function createFolder(
  accessToken: string,
  parentId: string,
  name: string
) {
  const response = await fetch(
    'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({
        fields: 'id,name',
        supportsAllDrives: 'true'
      }),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Drive folder creation failed');
  }

  return result.id as string;
}

async function ensureFolder(
  accessToken: string,
  parentId: string,
  name: string
) {
  return (
    (await findFolder(accessToken, parentId, name)) ||
    (await createFolder(accessToken, parentId, name))
  );
}

async function uploadToDrive(
  accessToken: string,
  parentId: string,
  file: File
) {
  const boundary = `tbs_student_journey_${crypto.randomUUID()}`;

  const metadata = {
    name: file.name,
    parents: [parentId]
  };

  const body = new Blob([
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    await file.arrayBuffer(),
    `\r\n--${boundary}--`
  ]);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?' +
      new URLSearchParams({
        uploadType: 'multipart',
        fields: 'id,name,mimeType,webViewLink,thumbnailLink,size',
        supportsAllDrives: 'true'
      }),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Google Drive upload failed');
  }

  return result;
}

function resolveMediaRole(
  requestedMediaRole: string,
  bucket: string,
  caption: string
) {
  if (requestedMediaRole) {
    return requestedMediaRole;
  }

  // Backward-compatible fallbacks.
  // Updated frontend code should always send media_role explicitly.
  if (bucket === 'profile') {
    return /hero|banner/i.test(caption) ? 'hero_banner' : 'profile_photo';
  }

  if (bucket === 'evidence') {
    return 'evidence';
  }

  return 'journey_media';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: cors
    });
  }

  if (req.method !== 'POST') {
    return json(
      {
        error: 'Method not allowed'
      },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not available.');
    }

    const authorization = req.headers.get('Authorization') || '';

    // Support both supabase.functions.invoke() and the existing raw fetch
    // used by journeyApi.js.
    const apiKey =
      req.headers.get('apikey') ||
      Deno.env.get('SUPABASE_ANON_KEY') ||
      '';

    if (!authorization.toLowerCase().startsWith('bearer ')) {
      return json(
        {
          error: 'Missing user authorization token.'
        },
        401
      );
    }

    if (!apiKey) {
      return json(
        {
          error:
            'Supabase API key is unavailable. Check SUPABASE_ANON_KEY or send the apikey header.'
        },
        500
      );
    }

    /*
     * USER-SCOPED SUPABASE CLIENT
     * RLS remains active.
     */
    const userClient = createClient(supabaseUrl, apiKey, {
      global: {
        headers: {
          Authorization: authorization
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error('Auth verification failed', userError);

      return json(
        {
          error:
            'Your login session could not be verified. Sign out and sign in again.'
        },
        401
      );
    }

    const form = await req.formData();

    const file = form.get('file');

    const studentId = String(form.get('student_id') || '').trim();

    const entryId =
      String(form.get('entry_id') || '').trim() || null;

    const caption = String(form.get('caption') || '');

    const bucket = String(form.get('bucket') || 'journey')
      .trim()
      .toLowerCase();

    const requestedMediaRole = String(
      form.get('media_role') || ''
    ).trim();

    if (!(file instanceof File)) {
      throw new Error('A file is required.');
    }

    // Large files are read into memory before going to Drive; keep them
    // within what an Edge Function can hold.
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      throw new Error(
        `${file.name} is larger than 50 MB. Please upload a smaller file, or add it as a Google Drive or YouTube link.`
      );
    }

    if (!studentId) {
      throw new Error('student_id is required.');
    }

    /*
     * MEDIA ROLE
     */
    const allowedMediaRoles = new Set([
      'profile_photo',
      'hero_banner',
      'journey_cover',
      'journey_media',
      'evidence',
      'gallery'
    ]);

    const mediaRole = resolveMediaRole(
      requestedMediaRole,
      bucket,
      caption
    );

    if (!allowedMediaRoles.has(mediaRole)) {
      throw new Error(`Unsupported media_role: ${mediaRole}`);
    }

    const profileLevel =
      mediaRole === 'profile_photo' ||
      mediaRole === 'hero_banner';

    if (profileLevel && entryId) {
      throw new Error(
        `${mediaRole} must not be attached to a Journey entry.`
      );
    }

    if (!profileLevel && !entryId) {
      throw new Error(
        `${mediaRole} requires a Journey entry.`
      );
    }

    if (
      profileLevel &&
      !String(file.type || '').startsWith('image/')
    ) {
      throw new Error(
        `${mediaRole} must be an image file.`
      );
    }

    /*
     * USER / STUDENT ACCESS CHECK
     */
    const {
      data: canManage,
      error: permissionError
    } = await userClient.rpc('journey_can_manage', {
      p_student_id: studentId
    });

    if (permissionError) {
      throw new Error(
        `Permission check failed: ${permissionError.message}`
      );
    }

    if (!canManage) {
      return json(
        {
          error:
            'You are not authorized to upload files for this student.'
        },
        403
      );
    }

    const {
      data: student,
      error: studentError
    } = await userClient
      .from('students')
      .select('student_id,full_name')
      .eq('student_id', studentId)
      .single();

    if (studentError || !student) {
      throw new Error(
        studentError?.message || 'Student not found.'
      );
    }

    const root = Deno.env.get(
      'STUDENT_JOURNEY_ROOT_FOLDER_ID'
    );

    if (!root) {
      throw new Error(
        'STUDENT_JOURNEY_ROOT_FOLDER_ID is not configured.'
      );
    }

    /*
     * GOOGLE DRIVE
     */
    const access = await googleAccessToken();

    const safeName = String(
      student.full_name || 'Student'
    )
      .replace(/[\\/]/g, '-')
      .trim();

    const studentFolder = await ensureFolder(
      access,
      root,
      `${studentId} - ${safeName}`
    );

    const profileFolder = await ensureFolder(
      access,
      studentFolder,
      'Profile'
    );

    const journeyFolder = await ensureFolder(
      access,
      studentFolder,
      'Journey Media'
    );

    const evidenceFolder = await ensureFolder(
      access,
      studentFolder,
      'Evidence'
    );

    const destination =
      bucket === 'profile'
        ? profileFolder
        : bucket === 'evidence'
          ? evidenceFolder
          : journeyFolder;

    /*
     * GOOGLE DRIVE UPLOAD
     */
    const googleFile = await uploadToDrive(
      access,
      destination,
      file
    );

    // From the file itself, so a PDF added to a Journey Moment is stored as a
    // document (not an image) and stays out of photo galleries.
    const mime = String(file.type || '');
    const evidenceType =
      mediaRole === 'evidence'
        ? 'document'
        : mime.startsWith('image/')
          ? 'image'
          : mime.startsWith('video/')
            ? 'video'
            : 'document';

    const now = new Date().toISOString();

    /*
     * SUPABASE EVIDENCE RECORD
     */
    const {
      data: evidence,
      error: evidenceError
    } = await userClient
      .from('student_journey_evidence')
      .insert({
        student_id: studentId,
        entry_id: entryId,
        evidence_type: evidenceType,
        media_provider: 'google_drive',

        // Critical: this is what identifies profile_photo / hero_banner.
        media_role: mediaRole,

        media_url: googleFile.webViewLink,
        drive_file_id: googleFile.id,
        drive_file_url: googleFile.webViewLink,
        thumbnail_url: googleFile.thumbnailLink || null,
        file_name: googleFile.name || file.name,
        caption,
        mime_type:
          googleFile.mimeType ||
          file.type ||
          null,
        file_size_bytes: Number(
          googleFile.size ||
            file.size ||
            0
        ),
        sort_order:
          mediaRole === 'journey_cover'
            ? 0
            : 10,
        active: true,
        is_public: false,
        uploaded_by: user.id,
        created_at: now,
        updated_at: now
      })
      .select('*')
      .single();

    if (evidenceError || !evidence) {
      console.error(
        'Journey evidence insert failed',
        evidenceError
      );

      throw new Error(
        'File uploaded to Google Drive, but the portfolio record could not be saved: ' +
          (evidenceError?.message || 'Unknown evidence error')
      );
    }

    /*
     * PROFILE LINK
     *
     * This is intentionally done here as well as in App.jsx.
     * It guarantees that once a profile photo / hero upload succeeds,
     * student_journey_profiles points to the exact new evidence record.
     */
    if (profileLevel) {
      const field =
        mediaRole === 'profile_photo'
          ? 'profile_photo_url'
          : 'banner_image_url';

      const {
        error: profileLinkError
      } = await userClient
        .from('student_journey_profiles')
        .upsert(
          {
            student_id: studentId,
            [field]: `evidence:${evidence.id}`,
            updated_at: now
          },
          {
            onConflict: 'student_id'
          }
        );

      if (profileLinkError) {
        console.error(
          'Profile media link update failed',
          profileLinkError
        );

        throw new Error(
          'The file and evidence record were saved, but the profile could not be linked to the new image: ' +
            profileLinkError.message
        );
      }
    }

    return json({
      ok: true,
      evidence,
      google_file: {
        id: googleFile.id,
        name: googleFile.name,
        webViewLink: googleFile.webViewLink
      },
      folders: {
        student_folder_id: studentFolder,
        destination_folder_id: destination
      }
    });
  } catch (e) {
    console.error(
      'journey-drive-upload failed',
      e
    );

    return json(
      {
        error:
          e instanceof Error
            ? e.message
            : String(e)
      },
      400
    );
  }
});
