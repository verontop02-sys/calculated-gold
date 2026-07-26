import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle.jsx';
import { IconCalc, IconClients, IconInvest, IconChat, IconSettings, IconLogout } from './ClientSidebar.jsx';

/**
 * Нижняя навигация кабинета клиента — тот же паттерн, что и у сотрудников
 * (MobileNav.jsx): 4 ключевых раздела + «Ещё» c drawer-меню.
 */
export function ClientMobileNav({ tab, onChange, phoneMasked, onOpenCabinet, onSignOut, supportUnread = 0 }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const primary = [
    { key: 'home', label: 'Кабинет', icon: <IconDashboard /> },
    { key: 'invest', label: 'Золото', icon: <IconInvest /> },
    { key: 'history', label: 'Сделки', icon: <IconClients /> },
    { key: 'calc', label: 'Калькулятор', icon: <IconCalc /> },
  ];

  const more = [
    { key: 'support', label: 'Поддержка', icon: <IconChat />, badge: supportUnread },
    { key: 'settings', label: 'Настройки', icon: <IconSettings /> },
  ];

  const isInMore = more.some((m) => m.key === tab);

  useEffect(() => {
    if (drawerOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.dataset.cpxLockY = String(scrollY);
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      const y = parseInt(document.body.dataset.cpxLockY || '0', 10);
      delete document.body.dataset.cpxLockY;
      if (y) window.scrollTo(0, y);
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [drawerOpen]);

  function pick(key) {
    onChange(key);
    setDrawerOpen(false);
  }

  return (
    <>
      <nav className="cpm-nav" role="navigation" aria-label="Разделы">
        {primary.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`cpm-nav__item${tab === it.key ? ' cpm-nav__item--active' : ''}`}
            onClick={() => pick(it.key)}
          >
            <span className="cpm-nav__icon">{it.icon}</span>
            <span className="cpm-nav__label">{it.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`cpm-nav__item${(drawerOpen || isInMore) ? ' cpm-nav__item--active' : ''}`}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span className="cpm-nav__icon">
            <IconMore />
            {supportUnread > 0 && !isInMore && <span className="cpm-nav__dot" aria-hidden />}
          </span>
          <span className="cpm-nav__label">Ещё</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="cpm-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="cpm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cpm-drawer__handle" />
            <div className="cpm-drawer__header">
              <button
                type="button"
                className="cpm-drawer__user"
                onClick={() => { setDrawerOpen(false); onOpenCabinet?.(); }}
              >
                <span className="cpm-drawer__avatar" aria-hidden>К</span>
                <div className="cpm-drawer__user-text">
                  <span className="cpm-drawer__phone">{phoneMasked || 'Клиент'}</span>
                  <span className="cpm-drawer__hint">Личный кабинет ›</span>
                </div>
              </button>
              <button type="button" className="cpm-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Закрыть">✕</button>
            </div>

            <div className="cpm-drawer__section">
              <div className="cpm-drawer__section-title">Разделы</div>
              {more.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`cpm-drawer__item${tab === it.key ? ' cpm-drawer__item--active' : ''}`}
                  onClick={() => pick(it.key)}
                >
                  <span className="cpm-drawer__item-icon">{it.icon}</span>
                  <span className="cpm-drawer__item-label">{it.label}</span>
                  {it.badge > 0 && <span className="cpm-drawer__item-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
                  <span className="cpm-drawer__item-arrow">›</span>
                </button>
              ))}
            </div>

            <div className="cpm-drawer__section">
              <div className="cpm-drawer__section-title">Настройки</div>
              <div className="cpm-drawer__row">
                <span className="cpm-drawer__row-label">Тема</span>
                <ThemeToggle />
              </div>
              <a className="cpm-drawer__item" href="/" style={{ textDecoration: 'none' }}>
                <span className="cpm-drawer__item-icon"><IconHomeArrow /></span>
                <span className="cpm-drawer__item-label">На главную reaktivo.ru</span>
              </a>
              <button type="button" className="cpm-drawer__item cpm-drawer__item--danger" onClick={() => { setDrawerOpen(false); onSignOut(); }}>
                <span className="cpm-drawer__item-icon"><IconLogout /></span>
                <span className="cpm-drawer__item-label">Выйти из аккаунта</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}
function IconHomeArrow() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}

const CSS = `
.cpm-nav { display: none; }

@media (max-width: 900px) {
  .cpm-nav {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--bg-panel-solid);
    border-top: 1px solid var(--cpx-stroke);
    padding-bottom: env(safe-area-inset-bottom, 0);
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.10);
  }
  .cpm-nav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px 6px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.65rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 200ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    min-height: 56px;
    border-radius: 8px;
    position: relative;
  }
  .cpm-nav__item:active { transform: scale(0.94); }
  .cpm-nav__item--active { color: var(--cpx-accent); }
  .cpm-nav__item--active .cpm-nav__icon {
    background: var(--cpx-accent-soft);
    box-shadow: 0 0 0 1px var(--cpx-stroke) inset;
    transform: translateY(-2px);
  }
  .cpm-nav__icon {
    display: flex; align-items: center; justify-content: center;
    width: 38px; height: 28px;
    border-radius: 12px;
    transition: background 220ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 220ms;
    position: relative;
  }
  .cpm-nav__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .cpm-nav__dot {
    position: absolute; top: 2px; right: 2px;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--danger, #ef4444);
    box-shadow: 0 0 0 2px var(--bg-panel-solid);
  }
}

.cpm-overlay {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(6, 4, 2, 0.55);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  display: flex; align-items: flex-end;
  animation: cpmFade 260ms cubic-bezier(0.22, 1, 0.36, 1);
  touch-action: none;
  overscroll-behavior: contain;
}
@keyframes cpmFade { from { opacity: 0; } to { opacity: 1; } }
.cpm-drawer {
  width: 100%;
  background: var(--bg-panel-solid);
  border-radius: 22px 22px 0 0;
  padding: 12px 0 calc(20px + env(safe-area-inset-bottom, 0));
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  animation: cpmSlide 380ms cubic-bezier(0.22, 1, 0.36, 1);
  color-scheme: light dark;
  box-shadow: 0 -12px 50px rgba(0, 0, 0, 0.35);
}
@keyframes cpmSlide { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.cpm-drawer__handle { width: 40px; height: 4px; border-radius: 2px; background: var(--cpx-stroke); margin: 0 auto 14px; }
.cpm-drawer__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 18px 12px; border-bottom: 1px solid var(--cpx-stroke); margin-bottom: 10px;
}
.cpm-drawer__user { display: flex; align-items: center; gap: 12px; min-width: 0; border: none; background: transparent; cursor: pointer; text-align: left; padding: 4px; border-radius: 12px; transition: background 0.16s; flex: 1; }
.cpm-drawer__user:active { background: var(--cpx-accent-soft); }
.cpm-drawer__avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--accent-grad, var(--cpx-accent));
  color: #fff; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px var(--cpx-accent-soft);
  flex-shrink: 0;
}
.cpm-drawer__user-text { display: flex; flex-direction: column; min-width: 0; }
.cpm-drawer__phone { font-size: 0.9rem; font-weight: 600; color: var(--cpx-ink); }
.cpm-drawer__hint { font-size: 0.72rem; font-weight: 600; color: var(--cpx-accent); letter-spacing: 0.02em; }
.cpm-drawer__close {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--cpx-stroke); background: var(--input-bg);
  color: var(--text-muted); font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
}
.cpm-drawer__section { padding: 8px 12px; }
.cpm-drawer__section + .cpm-drawer__section { border-top: 1px solid var(--cpx-stroke); padding-top: 14px; margin-top: 6px; }
.cpm-drawer__section-title { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--text-dim); font-weight: 700; padding: 6px 10px; }
.cpm-drawer__item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 12px;
  background: transparent; border: none; color: var(--cpx-ink);
  font-size: 0.94rem; font-weight: 500; cursor: pointer;
  width: 100%; text-align: left;
  transition: background 0.18s, color 0.18s;
  box-sizing: border-box;
}
.cpm-drawer__item:active { background: var(--cpx-accent-soft); }
.cpm-drawer__item--active { background: var(--cpx-accent-soft); color: var(--cpx-accent); }
.cpm-drawer__item--danger { color: var(--danger, #ef4444); }
.cpm-drawer__item--danger:active { background: color-mix(in srgb, var(--danger, #ef4444) 15%, transparent); }
.cpm-drawer__item-icon {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; background: var(--cpx-accent-soft); color: var(--cpx-accent); flex-shrink: 0;
}
.cpm-drawer__item--danger .cpm-drawer__item-icon { background: color-mix(in srgb, var(--danger, #ef4444) 15%, transparent); color: var(--danger, #ef4444); }
.cpm-drawer__item-label { flex: 1; }
.cpm-drawer__item-arrow { color: var(--text-dim); font-size: 1.1rem; }
.cpm-drawer__item-badge {
  flex-shrink: 0; min-width: 19px; height: 19px; border-radius: 999px; padding: 0 6px;
  background: var(--cpx-accent); color: #fff; font-size: 0.66rem; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
.cpm-drawer__row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 12px; }
.cpm-drawer__row-label { font-size: 0.94rem; color: var(--cpx-ink); }

@media (min-width: 901px) {
  .cpm-overlay { display: none; }
}
`;
