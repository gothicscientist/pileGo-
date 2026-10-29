// Light, dark or whatever the device says. The choice is kept per browser and
// applied before React starts (see the inline script in index.html), so the
// page never flashes the wrong colours.

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'pilego-theme';
export const THEME_EVENT = 'pilego-theme';

export function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function resolved(): 'light' | 'dark' {
  const t = savedTheme();
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme on screen now, and a switch that flips it. Stays in step with Settings and the device. */
export function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState(resolved);

  useEffect(() => {
    const on = () => setTheme(resolved());
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', on);
    window.addEventListener(THEME_EVENT, on);
    return () => {
      mq?.removeEventListener('change', on);
      window.removeEventListener(THEME_EVENT, on);
    };
  }, []);

  const toggle = useCallback(() => applyTheme(resolved() === 'dark' ? 'light' : 'dark'), []);
  return [theme, toggle];
}

