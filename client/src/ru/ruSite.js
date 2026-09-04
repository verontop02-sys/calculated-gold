/** Слаги маркетинговых страниц (без префикса /ru). */
export const RU_SLUGS = ['prodat', 'kurier', 'slitki', 'resale', 'agenty', 'franshiza', 'partneram', 'o-kompanii'];

export const PRO_ORIGIN = 'https://reaktivo.pro';

export function currentHostname() {
  return typeof window !== 'undefined' ? String(window.location.hostname || '') : '';
}

function normHost(hostname) {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase();
}

/** Сайт выкупа: боевой reaktivo.ru, превью Firebase, либо сборка --mode ru. */
export function isReaktivoRuHost(hostname = currentHostname()) {
  if (String(import.meta.env?.VITE_SITE || '').toLowerCase() === 'ru') return true;
  const h = normHost(hostname);
  return h === 'reaktivo.ru' || h === 'reaktivo-ru.web.app' || h === 'reaktivo-ru.firebaseapp.com';
}

/**
 * Ссылка на страницу выкупа: на reaktivo.ru без префикса, на .pro и localhost — /ru/.
 * @param {string} [slug] пусто = главная
 * @param {string} [hash] с # или без
 */
export function ruHref(slug = '', hash = '') {
  const s = String(slug || '').replace(/^\/+|\/+$/g, '');
  const h = !hash ? '' : hash.startsWith('#') ? hash : `#${hash}`;
  if (isReaktivoRuHost()) return `${s ? `/${s}/` : '/'}${h}`;
  return `${s ? `/ru/${s}/` : '/ru/'}${h}`;
}

/** Панель / кабинет живут на reaktivo.pro. */
export function staffHref(pathAndQuery = '/pro') {
  const raw = String(pathAndQuery || '/pro');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (isReaktivoRuHost()) return `${PRO_ORIGIN}${path}`;
  return path;
}

/** Какая RU-страница открыта, или null если это не маркетинг выкупа. */
export function matchRuRoute(pathname = typeof window !== 'undefined' ? window.location.pathname : '', hostname = currentHostname()) {
  const raw = String(pathname || '');
  const p = raw.replace(/\/+$/, '') || '/';
  const prefixes = isReaktivoRuHost(hostname) ? ['', '/ru'] : ['/ru'];
  for (const prefix of prefixes) {
    let rest = null;
    if (!prefix) {
      rest = p;
    } else if (p === prefix) {
      rest = '/';
    } else if (p.startsWith(`${prefix}/`)) {
      rest = p.slice(prefix.length) || '/';
    }
    if (rest == null) continue;
    const slug = rest.replace(/^\/+|\/+$/g, '');
    if (!slug) return 'home';
    if (RU_SLUGS.includes(slug)) return slug;
  }
  return null;
}
