import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme } from './theme.js';

export function ThemeToggle({ className = '' }) {
  const [mode, setMode] = useState(() => getStoredTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function toggle() {
    setMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }

  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      <span className="theme-toggle-track" aria-hidden>
        <span className="theme-toggle-icons">
          <span className="theme-toggle-ico theme-toggle-ico-sun">☀</span>
          <span className="theme-toggle-ico theme-toggle-ico-moon">☾</span>
        </span>
        <span className={`theme-toggle-thumb ${isDark ? 'is-dark' : ''}`} />
      </span>
    </button>
  );
}
