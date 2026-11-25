/* =========================================================================
   FRIENDLY MESSAGES
   Nothing technical ever reaches the screen. Known situations get a calm,
   encouraging sentence; anything that looks like a system message is
   replaced with a gentle fallback (the detail still goes to the console
   for the school's tech team).
   ========================================================================= */

const DEFAULT = 'Something didn’t go quite as planned. Please try again in a moment.';

const RULES = [
  [/failed to fetch|networkerror|network request|load failed|offline|took too long|timed? ?out/i,
    'We couldn’t reach the school portfolio just now. Check your connection and try again.'],
  [/jwt|session|sign in again|not authenticated|401|expired/i,
    'For your security, please sign in again to continue.'],
  // Sign-in code requested for an email that has no sign-in yet
  // (Supabase: "Signups not allowed for otp").
  [/not_on_school_list|signups? not allowed|otp_disabled|user not found|email not found/i,
    'This email isn’t on the school list yet. Check it’s your school email, or ask the portfolio team to add you.'],
  [/permission|denied|row-level|rls|403|not allowed|forbidden/i,
    'This area isn’t open to your account yet. The portfolio team can help if you think it should be.'],
  [/too many|rate limit|429/i,
    'Lots happening at once! Please wait a moment and try again.'],
  [/too large|payload|file size|exceeds/i,
    'That file is a little too large. Please choose a smaller one.'],
  [/duplicate|already exists|unique/i,
    'This has already been saved — you’re all set.']
];

const TECHNICAL =
  /[_{}<>[\]`]|\b(sql|supabase|postgres|pgrst|jwt|rls|relation|column|schema|function|edge|json|syntax|undefined|null|token|violates|constraint|uuid|http|status|fetch|cors|stack|exception|record|query|migration|bucket|storage|evidence record)\b|\(\d{3}\)|\b\d{3,}\b/i;

export function friendlyError(error, fallback = DEFAULT) {
  const message = String(error?.message || error || '').trim();
  if (message && typeof console !== 'undefined') console.warn('[portfolio]', message);
  if (!message) return fallback;

  for (const [pattern, text] of RULES) {
    if (pattern.test(message)) return text;
  }
  if (TECHNICAL.test(message) || message.length > 180) return fallback;
  return message;
}
