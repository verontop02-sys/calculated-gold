/** Публичный счётчик Яндекс Метрики (не для /pro, кабинета и служебных экранов). */
const YM_ID = Number(String(import.meta.env.VITE_YM_ID || '').replace(/\D/g, '')) || 0;

function isPublicMarketingPath(path) {
  const p = String(path || '');
  if (/^\/pro\/?$/.test(p)) return false;
  if (/^\/kabinet\/?$/.test(p)) return false;
  if (/^\/display\/?$/.test(p)) return false;
  if (/^\/podtverzhdenie\//.test(p)) return false;
  return true;
}

export function initYandexMetrika() {
  if (!YM_ID || typeof window === 'undefined') return;
  if (!isPublicMarketingPath(window.location.pathname || '')) return;
  if (typeof window.ym === 'function') {
    window.ym(YM_ID, 'hit', window.location.href);
    return;
  }

  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (let j = 0; j < e.scripts.length; j += 1) {
      if (e.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, 'script', `https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}`, 'ym');

  window.ym(YM_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    accurateTrackBounce: true,
    trackLinks: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: window.location.href,
  });

  const noscript = document.createElement('noscript');
  noscript.innerHTML = `<div><img src="https://mc.yandex.ru/watch/${YM_ID}" style="position:absolute;left:-9999px;" alt="" /></div>`;
  document.body.appendChild(noscript);
}

export function ymReachGoal(name, params) {
  if (!YM_ID || typeof window === 'undefined' || typeof window.ym !== 'function') return;
  const goal = String(name || '').trim();
  if (!goal) return;
  window.ym(YM_ID, 'reachGoal', goal, params);
}
