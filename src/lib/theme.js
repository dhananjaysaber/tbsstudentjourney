import { useEffect, useState } from 'react';

/* =========================================================================
   THEME
   'light' or 'dark', saved on this device. Until someone chooses, the
   device's own setting decides (and follows it if it changes) — except on
   student portfolios, which open in light mode and keep their own choice.
   index.html applies the theme before the first paint so there's no flash.
   ========================================================================= */

export const THEME_KEY = 'tbs-theme';
/* Student portfolios keep their own choice, and open in light mode. */
export const PORTFOLIO_THEME_KEY = 'tbs-theme-portfolio-v2';
const THEME_COLOURS = { light: '#ffffff', dark: '#151449' };

export function isPortfolioPage() {
  return (
    /^\/(p|portfolio)\//.test(window.location.pathname) ||
    /[?&](share|previewStudent)=/.test(window.location.search)
  );
}

const keyForPage = () => (isPortfolioPage() ? PORTFOLIO_THEME_KEY : THEME_KEY);

function stored() {
  try {
    const value = localStorage.getItem(keyForPage());
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme, animate) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('isThemeSwitching');
    window.clearTimeout(apply.timer);
    apply.timer = window.setTimeout(() => root.classList.remove('isThemeSwitching'), 500);
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOURS[theme]);
  window.dispatchEvent(new CustomEvent('tbs-theme', { detail: theme }));
}

export function setTheme(theme) {
  try {
    localStorage.setItem(keyForPage(), theme);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  apply(theme, true);
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/* Current theme, kept in sync with the toggle and the device setting. */
export function useTheme() {
  const [theme, setState] = useState(currentTheme);

  useEffect(() => {
    const onTheme = event => setState(event.detail);
    window.addEventListener('tbs-theme', onTheme);

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    // Portfolios stay light unless someone switches; other pages follow the device.
    const onSystem = () => {
      if (!stored() && !isPortfolioPage()) apply(systemTheme(), true);
    };
    media?.addEventListener?.('change', onSystem);

    return () => {
      window.removeEventListener('tbs-theme', onTheme);
      media?.removeEventListener?.('change', onSystem);
    };
  }, []);

  return theme;
}
