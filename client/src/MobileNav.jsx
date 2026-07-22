import { useState, useEffect } from 'react';
import { isSuperAdminRole, isUserManagerRole, roleLabel } from './roles.js';
import { ThemeToggle } from './ThemeToggle.jsx';

/**
 * Мобильная навигация: нижний bar с 4-5 ключевыми разделами + кнопка «Ещё»,
 * которая открывает drawer-меню с остальными пунктами, темой и выходом.
 */
export function MobileNav({ tab, onChange, user, onSignOut, onOpenProfile }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isSuper = isSuperAdminRole(user?.role);
  const isAdmin = isUserManagerRole(user?.role);

  // Основные пункты — те, что чаще всего нужны
  const primary = [
    { key: 'dashboard', label: 'Дашборд', icon: <IconDashboard /> },
    { key: 'calc', label: 'Расчёт', icon: <IconCalc /> },
    { key: 'contract', label: 'Договор', icon: <IconContract /> },
    { key: 'clients', label: 'Клиенты', icon: <IconClients /> },
  ];

  // Дополнительные — открываются в drawer.
  // Курьер и продавец «Команду и KPI» не видят — это управленческая сводка.
  const more = [
    { key: 'analytics', label: 'Аналитика', icon: <IconChart /> },
    ...(isAdmin ? [{ key: 'team', label: 'Команда и KPI', icon: <IconTeam /> }] : []),
    ...(isAdmin ? [{ key: 'employees', label: 'Сделки сотрудников', icon: <IconClients /> }] : []),
    ...(isSuper ? [{ key: 'gold-index', label: 'Индекс золота', icon: <IconMap /> }] : []),
    ...(isAdmin ? [{
      key: 'settings',
      label: isSuper ? 'Настройки и доступы' : 'Пользователи',
      icon: <IconSettings />,
    }] : []),
  ];

  const isInMore = more.some((m) => m.key === tab);

  useEffect(() => {
    if (drawerOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      // iOS Safari требует position:fixed чтобы реально остановить скролл
      document.body.dataset.cgLockY = String(scrollY);
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      const y = parseInt(document.body.dataset.cgLockY || '0', 10);
      delete document.body.dataset.cgLockY;
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
      <nav className="cg-mobnav" role="navigation" aria-label="Разделы">
        {primary.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`cg-mobnav__item${tab === it.key ? ' cg-mobnav__item--active' : ''}`}
            onClick={() => pick(it.key)}
          >
            <span className="cg-mobnav__icon">{it.icon}</span>
            <span className="cg-mobnav__label">{it.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`cg-mobnav__item${(drawerOpen || isInMore) ? ' cg-mobnav__item--active' : ''}`}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span className="cg-mobnav__icon"><IconMore /></span>
          <span className="cg-mobnav__label">Ещё</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="cg-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="cg-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cg-drawer__handle" />
            <div className="cg-drawer__header">
              <button
                type="button"
                className="cg-drawer__user cg-drawer__user--btn"
                onClick={() => { setDrawerOpen(false); onOpenProfile?.(); }}
              >
                <span className="cg-drawer__avatar">
                  {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="cg-drawer__user-text">
                  <span className="cg-drawer__email" title={user?.displayName || user?.email}>
                    {user?.displayName || user?.email}
                  </span>
                  {user?.displayName && (
                    <span className="cg-drawer__role cg-drawer__role--sub" title={user?.email}>{user?.email}</span>
                  )}
                  <span className="cg-drawer__role">{roleLabel(user?.role)} · открыть профиль ›</span>
                </div>
              </button>
              <button
                type="button"
                className="cg-drawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {more.length > 0 && (
              <div className="cg-drawer__section">
                <div className="cg-drawer__section-title">Разделы</div>
                {more.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    className={`cg-drawer__item${tab === it.key ? ' cg-drawer__item--active' : ''}`}
                    onClick={() => pick(it.key)}
                  >
                    <span className="cg-drawer__item-icon">{it.icon}</span>
                    <span className="cg-drawer__item-label">{it.label}</span>
                    <span className="cg-drawer__item-arrow">›</span>
                  </button>
                ))}
              </div>
            )}

            <div className="cg-drawer__section">
              <div className="cg-drawer__section-title">Настройки</div>
              <div className="cg-drawer__row">
                <span className="cg-drawer__row-label">Тема</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                className="cg-drawer__item cg-drawer__item--danger"
                onClick={() => { setDrawerOpen(false); onSignOut(); }}
              >
                <span className="cg-drawer__item-icon"><IconLogout /></span>
                <span className="cg-drawer__item-label">Выйти из аккаунта</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{MOBNAV_CSS}</style>
    </>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function IconCalc() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}
function IconContract() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}
function IconClients() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 4 3 5-7" />
    </svg>
  );
}
function IconTeam() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15l-3 6 3-2 3 2-3-6z" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}
function IconMap() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6v15l7-3 8 3 7-3V3l-7 3-8-3-7 3z" />
      <path d="M8 3v15M16 6v15" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.73 1.13V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.73-1.13l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 3 14h-.1a2 2 0 1 1 0-4H3a1.6 1.6 0 0 0 1.42-2.7l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.42l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.6 1z" />
    </svg>
  );
}
function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

const MOBNAV_CSS = `
.cg-mobnav {
  display: none;
}

@media (max-width: 900px) {
  .cg-mobnav {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--bg-panel-solid);
    border-top: 1px solid var(--sidebar-stroke);
    padding-bottom: env(safe-area-inset-bottom, 0);
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.10);
  }
  .cg-mobnav__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px 6px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.66rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      color 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
    min-height: 56px;
    border-radius: 8px;
  }
  .cg-mobnav__item:active { transform: scale(0.94); }
  .cg-mobnav__item--active { color: var(--gold); }
  .cg-mobnav__item--active .cg-mobnav__icon {
    background: var(--gold-soft);
    box-shadow: 0 0 0 1px var(--stroke-strong) inset;
    transform: translateY(-2px);
  }
  .cg-mobnav__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px; height: 28px;
    border-radius: 12px;
    transition:
      background 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
      transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 220ms;
  }
  .cg-mobnav__label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
}

/* Drawer */
.cg-drawer-overlay {
  position: fixed; inset: 0;
  z-index: 80;
  background: rgba(6,4,2,0.55);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  animation: drawerFade 260ms cubic-bezier(0.22, 1, 0.36, 1);
  /* На iOS Safari запрещаем скролл-через-overlay */
  touch-action: none;
  overscroll-behavior: contain;
}
@keyframes drawerFade { from { opacity: 0; } to { opacity: 1; } }
.cg-drawer {
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
  animation: drawerSlide 380ms cubic-bezier(0.22, 1, 0.36, 1);
  color-scheme: light dark;
  box-shadow: 0 -12px 50px rgba(0, 0, 0, 0.35);
}
@keyframes drawerSlide {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.cg-drawer__handle {
  width: 40px; height: 4px;
  border-radius: 2px;
  background: var(--stroke-strong);
  margin: 0 auto 14px;
}
.cg-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 12px;
  border-bottom: 1px solid var(--sidebar-stroke);
  margin-bottom: 10px;
}
.cg-drawer__user { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cg-drawer__user--btn { border: none; background: transparent; cursor: pointer; text-align: left; padding: 4px; border-radius: 12px; transition: background 0.16s; flex: 1; }
.cg-drawer__user--btn:active { background: var(--accent-soft); }
.cg-drawer__avatar {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold), var(--gold-dim));
  color: #fff;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 10px var(--gold-glow);
}
.cg-drawer__user-text { display: flex; flex-direction: column; min-width: 0; }
.cg-drawer__email {
  font-size: 0.86rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.cg-drawer__role {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--gold);
  letter-spacing: 0.04em;
}
.cg-drawer__close {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 1px solid var(--stroke);
  background: var(--input-bg);
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
}

.cg-drawer__section { padding: 8px 12px; }
.cg-drawer__section + .cg-drawer__section { border-top: 1px solid var(--sidebar-stroke); padding-top: 14px; margin-top: 6px; }
.cg-drawer__section-title {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  font-weight: 700;
  padding: 6px 10px;
}
.cg-drawer__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.94rem;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background 0.18s, color 0.18s;
}
.cg-drawer__item:active { background: var(--gold-soft); }
.cg-drawer__item--active { background: var(--gold-soft); color: var(--gold); }
.cg-drawer__item--danger { color: var(--crimson); }
.cg-drawer__item--danger:active { background: var(--crimson-soft); }
.cg-drawer__item-icon {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  background: var(--gold-soft);
  color: var(--gold);
  flex-shrink: 0;
}
.cg-drawer__item--danger .cg-drawer__item-icon {
  background: var(--crimson-soft);
  color: var(--crimson);
}
.cg-drawer__item-label { flex: 1; }
.cg-drawer__item-arrow { color: var(--text-dim); font-size: 1.1rem; }

.cg-drawer__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 12px;
}
.cg-drawer__row-label { font-size: 0.94rem; }

@media (min-width: 901px) {
  .cg-drawer-overlay { display: none; }
}
`;
