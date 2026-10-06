// Light / dark theme. The choice is remembered in this browser; until the user picks,
// the site follows the computer or phone setting.
const KEY = 'hms-theme';

export function savedTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
}

export function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme() {
  return document.documentElement.dataset.theme || savedTheme() || systemTheme();
}

export function applyTheme(theme, remember = true) {
  document.documentElement.dataset.theme = theme;
  if (remember) { try { localStorage.setItem(KEY, theme); } catch { /* private window: still works for this visit */ } }
}

// Called once before the app draws, so the page does not flash the wrong colours.
export function initTheme() {
  const t = savedTheme();
  if (t) applyTheme(t, false);
}
