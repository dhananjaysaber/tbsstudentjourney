/* =========================================================================
   BRAND
   TBS_LOGO        full-colour crest, used on light backgrounds.
   TBS_LOGO_WHITE  white crest for dark backgrounds (landing, portfolio cover).
                   Put the file at public/brand/tbs-logo-white.png — until it
                   exists, the colour crest is shown instead (no glow behind it).
   ========================================================================= */

export const TBS_LOGO = 'https://tbspanthers.british-school.org/wp-content/uploads/2024/12/TBS.png';
export const TBS_LOGO_WHITE = '/brand/tbs-logo-white.png';

/* <img onError={useColourLogo}> — falls back to the colour crest once. */
export function useColourLogo(event) {
  const img = event.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  img.src = TBS_LOGO;
}
