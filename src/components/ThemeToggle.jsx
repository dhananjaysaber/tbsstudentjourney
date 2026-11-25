import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { toggleTheme, useTheme } from '../lib/theme';

/* Sun / moon switch. Works anywhere: landing, sign-in, workspace, portfolio. */
export default function ThemeToggle({ small = false, className = '' }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={`themeToggle ${small ? 'isSmall' : ''} ${className}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Moon className="isMoon" aria-hidden="true" />
      <Sun className="isSun" aria-hidden="true" />
    </button>
  );
}
