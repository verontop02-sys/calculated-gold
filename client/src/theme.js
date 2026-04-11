const KEY = 'cg-theme';

/** @returns {'light' | 'dark'} */
export function getStoredTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'dark';
}

/** @param {'light' | 'dark'} mode */
export function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', mode === 'light' ? '#f5f2ec' : '#0c0a09');
  }
}

export function initThemeFromStorage() {
  applyTheme(getStoredTheme());
}
