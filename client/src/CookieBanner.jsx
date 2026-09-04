import { useEffect, useState } from 'react';
import { grantCookieConsent, hasCookieConsent, initYandexMetrika } from './yandexMetrika.js';

function isStaffOrPortalPath() {
  const p = typeof window !== 'undefined' ? window.location.pathname || '' : '';
  return /^\/pro\/?$/.test(p) || /^\/kabinet\/?$/.test(p) || /^\/display\/?$/.test(p) || /^\/podtverzhdenie\//.test(p);
}

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStaffOrPortalPath()) return;
    if (hasCookieConsent()) {
      initYandexMetrika();
      return;
    }
    setOpen(true);
  }, []);

  if (!open) return null;

  function accept() {
    grantCookieConsent();
    setOpen(false);
  }

  return (
    <div className="ck-banner" role="dialog" aria-label="Файлы cookie и аналитика">
      <p className="ck-banner-text">
        Сайт использует файлы cookie и сервисы аналитики (Яндекс Метрика) для статистики и рекламы.
        Подробнее в{' '}
        <a href="/privacy" className="ck-banner-link">Политике обработки персональных данных</a>.
        Нажав «Согласен», вы даёте согласие на обработку персональных данных. Отказаться можно в настройках браузера.
      </p>
      <button type="button" className="ck-banner-btn" onClick={accept}>
        Согласен
      </button>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ck-banner {
  position: fixed;
  z-index: 80;
  left: 16px;
  right: 16px;
  bottom: 16px;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid var(--stroke);
  background: color-mix(in srgb, var(--bg-panel-solid) 92%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--shadow-pop);
  font-family: var(--font-ui);
}
.ck-banner-text {
  margin: 0;
  flex: 1;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--text-muted);
}
.ck-banner-link {
  color: var(--accent);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ck-banner-btn {
  flex-shrink: 0;
  appearance: none;
  border: 0;
  cursor: pointer;
  padding: 11px 18px;
  border-radius: 12px;
  background: var(--accent-grad);
  color: #fff;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 800;
}
.ck-banner-btn:hover { filter: brightness(1.06); }
@media (max-width: 640px) {
  .ck-banner {
    left: 10px;
    right: 10px;
    bottom: 10px;
    flex-direction: column;
    align-items: stretch;
    padding: 14px;
  }
  .ck-banner-btn { width: 100%; }
}
`;
