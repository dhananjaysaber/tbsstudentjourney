/* One rule for "is this a photo?". Photos are normally saved as images, but
 * an imported moment may keep its photo as a Google Drive link saved as the
 * moment's cover or gallery media — that is a photo too. Certificates and
 * documents (media_role 'evidence') are not. */
const PHOTO_ROLES = ['journey_cover', 'journey_media', 'gallery'];

export function isDrivePhoto(item) {
  return Boolean(
    item &&
      item.media_provider === 'google_drive' &&
      (item.drive_file_id || /drive\.google\.com/.test(String(item.media_url || ''))) &&
      PHOTO_ROLES.includes(item.media_role)
  );
}

export function isPhoto(item) {
  return Boolean(item && (item.evidence_type === 'image' || isDrivePhoto(item)));
}
