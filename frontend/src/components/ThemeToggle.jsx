// Sun / moon switch for light and dark theme (top bar, next to the bell).
import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, savedTheme } from '../services/theme';

const Sun = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export default function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);

  // If the user never picked, follow the device when it switches between light and dark.
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => { if (!savedTheme()) setTheme(e.matches ? 'dark' : 'light'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const pick = (t) => { applyTheme(t); setTheme(t); };

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button type="button" className={theme === 'light' ? 'on' : ''} aria-pressed={theme === 'light'} onClick={() => pick('light')} title="Light theme">
        <Sun /><span className="sr-only">Light theme</span>
      </button>
      <button type="button" className={theme === 'dark' ? 'on' : ''} aria-pressed={theme === 'dark'} onClick={() => pick('dark')} title="Dark theme">
        <Moon /><span className="sr-only">Dark theme</span>
      </button>
    </div>
  );
}
