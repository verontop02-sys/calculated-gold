/** Боевой хост панели: на reaktivo.pro /api часто отваливается, на pro.reaktivo.ru — стабильно. */
export const PANEL_ORIGIN = 'https://pro.reaktivo.ru';

export function pageHostname() {
  try {
    return String(window.location.hostname || '').replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isUnstableProHost(host = pageHostname()) {
  return host === 'reaktivo.pro';
}

/** Если открыли старый .pro — сразу на рабочий .ru хост панели (тот же билд). */
export function redirectUnstableProHost() {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return false;
  if (!isUnstableProHost()) return false;
  const next = `${PANEL_ORIGIN}${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace(next);
  return true;
}
