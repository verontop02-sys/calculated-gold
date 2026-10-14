import { API_BASE } from './api.js';
import { isReaktivoRuHost, matchRuRoute } from './ru/ruSite.js';

const SESSION_KEY = 'cg-visit';

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

function publicPath() {
  const path = String(window.location.pathname || '/');
  if (path === '/pro' || path.startsWith('/pro/')) return '';
  if (path === '/kabinet' || path.startsWith('/kabinet/')) return '';
  if (path === '/display' || path.startsWith('/display/')) return '';
  if (path.startsWith('/podtverzhdenie')) return '';
  return path;
}

/** Один просмотр публичной страницы. Панель, кабинет и localhost не считаем. */
export function trackPageView() {
  if (typeof window === 'undefined') return;
  const host = String(window.location.hostname || '').replace(/^www\./i, '').toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') return;
  const path = publicPath();
  if (!path) return;
  const sid = sessionId();
  if (!sid) return;
  const site = isReaktivoRuHost(host) || matchRuRoute(path, host) ? 'ru' : 'pro';
  let referrer = '';
  try {
    if (document.referrer) referrer = new URL(document.referrer).hostname;
  } catch { /* чужой referrer не обязателен */ }
  const body = JSON.stringify({ site, path, sessionId: sid, referrer });
  fetch(`${API_BASE}/public/pageview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}
