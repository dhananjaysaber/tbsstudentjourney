import './smoothScroll.css';

/* Scrolling uses the browser's own (compositor-driven) scrolling. On a Mac
 * trackpad or Magic Mouse that native momentum is the smoothest possible
 * scroll, and it never stutters when the page is busy rendering the 3D
 * spiral — unlike a JavaScript smooth-scroll layer, which runs on the same
 * thread as everything else.
 *
 * Only deliberate jumps (the "Enter my journey" button) get a scripted,
 * cinematic glide, which the user can interrupt at any time. */

const cinematicEase = t => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

let activeGlide = 0;

export function scrollToSection(target) {
  const element = typeof target === 'string' ? document.getElementById(target) : target;
  if (!element) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.scrollIntoView();
    return;
  }

  cancelAnimationFrame(activeGlide);

  const root = document.documentElement;
  const start = window.scrollY;
  const end = element.getBoundingClientRect().top + window.scrollY;
  const distance = end - start;
  const duration = Math.min(1800, Math.max(900, Math.abs(distance) * 0.9));
  const began = performance.now();
  const previousBehavior = root.style.scrollBehavior;

  root.style.scrollBehavior = 'auto';

  function cancel() {
    cancelAnimationFrame(activeGlide);
    finish();
  }

  function finish() {
    root.style.scrollBehavior = previousBehavior;
    window.removeEventListener('wheel', cancel);
    window.removeEventListener('touchstart', cancel);
    window.removeEventListener('keydown', cancel);
  }

  /* Any user input takes back control immediately. */
  window.addEventListener('wheel', cancel, { passive: true, once: true });
  window.addEventListener('touchstart', cancel, { passive: true, once: true });
  window.addEventListener('keydown', cancel, { once: true });

  function step(now) {
    const t = Math.min(1, (now - began) / duration);
    window.scrollTo(0, start + distance * cinematicEase(t));
    if (t < 1) activeGlide = requestAnimationFrame(step);
    else finish();
  }

  activeGlide = requestAnimationFrame(step);
}

/* Freeze the page behind full-screen overlays (the story view). */
export function setPageScrollLocked(locked) {
  document.documentElement.classList.toggle('isScrollLocked', locked);
}
