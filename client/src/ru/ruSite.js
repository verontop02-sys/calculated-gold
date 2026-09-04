/** Слаги маркетинговых страниц (без префикса /ru). */
export const RU_SLUGS = ['prodat', 'slitki', 'resale', 'agenty', 'franshiza', 'partneram', 'o-kompanii'];

export function currentHostname() {
  return typeof window !== 'undefined' ? String(window.location.hostname || '') : '';
}

/** Боевой домен выкупа — после снятия с Тильды корень сайта, не /ru/. */
export function isReaktivoRuHost(hostname = currentHostname()) {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase() === 'reaktivo.ru';
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
