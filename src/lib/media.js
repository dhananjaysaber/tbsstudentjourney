import { supabase } from './supabase';

/**
 * Uploads an image through a secure Panthers/WordPress proxy endpoint.
 * The browser never receives WordPress admin credentials.
 *
 * Expected endpoint response:
 * {
 *   "url": "https://.../image.jpg",
 *   "wordpress_media_id": 123,
 *   "thumbnail_url": "https://.../thumb.jpg"
 * }
 */
export async function uploadImageToWordPress(file) {
  const endpoint = import.meta.env.VITE_WORDPRESS_UPLOAD_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      'WordPress upload endpoint is not configured yet. Add VITE_WORDPRESS_UPLOAD_ENDPOINT after we reuse the Panthers Home Feed upload route.',
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('You must be signed in to upload an image.');

  const body = new FormData();
  body.append('file', file);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'WordPress image upload failed.');
  }

  const payload = await response.json();
  if (!payload?.url) throw new Error('Upload completed but no media URL was returned.');
  return payload;
}
