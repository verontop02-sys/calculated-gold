import { useState, useEffect } from 'react';
import { isSuperAdminRole, isUserManagerRole, roleLabel } from './roles.js';

/**
 * Основная навигация по разделам — sidebar на ПК.
 * На мобиле компонент скрыт CSS-ом, вместо него отрисовывается <MobileNav />.
 *
 * Свёрнутый режим (56px) — только иконки.
 * Развёрнутый режим (220px) — иконки + подписи + группы.
 *
 * Состояние «свёрнут/развёрнут» сохраняется в localStorage,
 * плюс автоматически расширяется при наведении (CSS-only).
 */
export function Sidebar({ tab, onChange, user, onSignOut, onPinnedChange }) {
  const [pinned, setPinned] = useState(() => {
    try {
      const v = localStorage.getItem('cg_sidebar_pinned');
      return v == null ? true : v === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cg_sidebar_pinned', pinned ? '1' : '0');
    } catch {
      /* ignore */
    }
    onPinnedChange?.(pinned);
  }, [pinned, onPinnedChange]);

  const isSuper = isSuperAdminRole(user?.role);
  const isAdmin = isUserManagerRole(user?.role);

  // Курьер и продавец «команду и KPI» не видят — это управленческая сводка.
  // Их экраны: калькулятор, договор, клиенты, своя аналитика.
  const analyticsItems = [
    { key: 'analytics', label: 'Аналитика', icon: <IconChart /> },
    ...(isAdmin ? [{ key: 'team', label: 'Команда и KPI', icon: <IconTeam /> }] : []),
    ...(isSuper ? [{ key: 'gold-index', label: 'Индекс золота', icon: <IconMap /> }] : []),
  ];

  const groups = [
    {
      key: 'deals',
      title: 'Сделки',
      items: [
        { key: 'calc', label: 'Калькулятор', icon: <IconCalc /> },
        { key: 'contract', label: 'Договор', icon: <IconContract /> },
        { key: 'clients', label: 'Клиенты', icon: <IconClients /> },
      ],
    },
    {
      key: 'analytics',
      title: 'Аналитика',
      items: analyticsItems,
    },
    ...(isAdmin
      ? [{
          key: 'system',
          title: 'Система',
          items: [
            {
              key: 'settings',
              label: isSuper ? 'Настройки и доступы' : 'Пользователи',
              icon: <IconSettings />,
            },
          ],
        }]
      : []),
  ];

  return (
    <aside className={`cg-sidebar${pinned ? ' cg-sidebar--pinned' : ''}`}>
      <div className="cg-sidebar__brand">
        <span className="cg-sidebar__brand-mark">
          <img src="/logo_reactivo1.png" alt="REAKTIVO PRO" />
        </span>
        <div className="cg-sidebar__brand-text">
          <span className="cg-sidebar__brand-title">REAKTIVO <b>PRO</b></span>
          <span className="cg-sidebar__brand-sub">панель оценки</span>
        </div>
      </div>

      <nav className="cg-sidebar__nav" role="navigation" aria-label="Разделы">
        {groups.map((g) => (
          <div key={g.key} className="cg-sidebar__group">
            <div className="cg-sidebar__group-title">{g.title}</div>
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                className={`cg-sidebar__item${tab === it.key ? ' cg-sidebar__item--active' : ''}`}
                onClick={() => onChange(it.key)}
                title={it.label}
                aria-current={tab === it.key ? 'page' : undefined}
              >
                <span className="cg-sidebar__item-icon">{it.icon}</span>
                <span className="cg-sidebar__item-label">{it.label}</span>
                {tab === it.key && <span className="cg-sidebar__item-dot" aria-hidden />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="cg-sidebar__footer">
        <div className="cg-sidebar__user">
          <span className="cg-sidebar__user-avatar" aria-hidden>
            {(user?.email || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="cg-sidebar__user-text">
            <span className="cg-sidebar__user-email" title={user?.email}>{user?.email}</span>
            <span className="cg-sidebar__user-role">{roleLabel(user?.role)}</span>
          </div>
        </div>
        <div className="cg-sidebar__footer-actions">
          <button
            type="button"
            className="cg-sidebar__pin"
            onClick={() => setPinned((v) => !v)}
            title={pinned ? 'Свернуть меню' : 'Закрепить раскрытым'}
            aria-pressed={pinned}
          >
            {pinned ? <IconChevronLeft /> : <IconChevronRight />}
          </button>
          <button
            type="button"
            className="cg-sidebar__logout"
            onClick={onSignOut}
            title="Выйти"
          >
            <IconLogout />
            <span className="cg-sidebar__logout-label">Выйти</span>
          </button>
        </div>
      </div>

      <style>{SIDEBAR_CSS}</style>
    </aside>
  );
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────
function IconCalc() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}
function IconContract() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}
function IconClients() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
      <path d="M5 21a7 7 0 0 1 14 0" opacity="0.4" />
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
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.32H9a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76V9c.4.61 1.01.97 1.69.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}
function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

const SIDEBAR_CSS = `
/* Sidebar — фиксированный по высоте, всегда занимает 64px в layout.
   Если "pinned" — занимает 232px стабильно.
   При hover (на collapsed) — расширяется поверх контента, без layout shift. */
.cg-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 64px;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-stroke);
  transition: width 0.22s cubic-bezier(0.4, 0.2, 0.2, 1), box-shadow 0.22s;
  z-index: 50;
  overflow: hidden;
}
.cg-sidebar--pinned { width: 232px; }
.cg-sidebar:not(.cg-sidebar--pinned):hover {
  width: 232px;
  box-shadow: var(--shadow-pop);
}

/* Brand */
.cg-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 14px;
  border-bottom: 1px solid var(--sidebar-stroke);
  min-height: 72px;
}
.cg-sidebar__brand-mark {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--stroke);
  box-shadow: 0 2px 10px rgba(0,0,0,0.12);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.cg-sidebar__brand-mark img { width: 100%; height: 100%; object-fit: contain; padding: 4px; box-sizing: border-box; }
.cg-sidebar__brand-text {
  display: flex; flex-direction: column;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s;
  min-width: 0;
}
.cg-sidebar--pinned .cg-sidebar__brand-text,
.cg-sidebar:hover .cg-sidebar__brand-text { opacity: 1; }
.cg-sidebar__brand-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text);
}
.cg-sidebar__brand-title b {
  color: var(--gold);
  font-weight: 700;
  font-size: 0.72em;
  background: var(--gold-soft);
  border: 1px solid var(--stroke-strong);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  letter-spacing: 0.14em;
}
.cg-sidebar__brand-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  margin-top: 2px;
}

/* Nav */
.cg-sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cg-sidebar__nav::-webkit-scrollbar { width: 6px; }
.cg-sidebar__nav::-webkit-scrollbar-thumb { background: var(--stroke); border-radius: 3px; }

.cg-sidebar__group { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.cg-sidebar__group:first-child { margin-top: 0; }
.cg-sidebar__group-title {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 10px 14px 4px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s;
  height: 24px;
}
.cg-sidebar--pinned .cg-sidebar__group-title,
.cg-sidebar:hover .cg-sidebar__group-title { opacity: 1; }

.cg-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 280ms cubic-bezier(0.16, 1, 0.3, 1),
    color 280ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 240ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
  text-align: left;
}
.cg-sidebar__item:hover {
  background: var(--gold-soft);
  color: var(--text);
}
.cg-sidebar__item:hover .cg-sidebar__item-icon {
  transform: scale(1.1);
  color: var(--gold);
}
.cg-sidebar__item:active { transform: scale(0.98); }
.cg-sidebar__item:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}
.cg-sidebar__item--active {
  background: var(--gold-soft);
  color: var(--gold);
  border-color: var(--stroke-strong);
}
.cg-sidebar__item--active .cg-sidebar__item-icon { color: var(--gold); }
.cg-sidebar__item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  flex-shrink: 0;
  color: currentColor;
  transition: transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1), color 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.cg-sidebar__item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  opacity: 0;
  transition: opacity 0.18s;
}
.cg-sidebar--pinned .cg-sidebar__item-label,
.cg-sidebar:hover .cg-sidebar__item-label { opacity: 1; }

.cg-sidebar__item-dot {
  position: absolute;
  left: 0; top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 0 4px 4px 0;
  background: var(--gold);
  box-shadow: 0 0 12px var(--gold-glow);
  animation: cgFadeIn 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Footer */
.cg-sidebar__footer {
  border-top: 1px solid var(--sidebar-stroke);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cg-sidebar__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  min-width: 0;
}
.cg-sidebar__user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--gold), var(--gold-dim));
  color: #1c1108;
  font-weight: 700;
  font-size: 0.85rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px var(--gold-glow);
}
.cg-sidebar__user-text {
  display: flex; flex-direction: column;
  min-width: 0;
  opacity: 0;
  transition: opacity 0.18s;
}
.cg-sidebar--pinned .cg-sidebar__user-text,
.cg-sidebar:hover .cg-sidebar__user-text { opacity: 1; }
.cg-sidebar__user-email {
  font-size: 0.78rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cg-sidebar__user-role {
  font-size: 0.66rem;
  color: var(--gold);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.cg-sidebar__footer-actions {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.cg-sidebar__pin {
  width: 36px; height: 36px;
  border-radius: 8px;
  border: 1px solid var(--stroke);
  background: var(--input-bg);
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.cg-sidebar__pin:hover { color: var(--gold); border-color: var(--stroke-strong); }
.cg-sidebar__pin:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
.cg-sidebar__logout {
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--stroke);
  background: var(--input-bg);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  flex: 1;
  min-width: 36px;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.cg-sidebar__logout:hover {
  color: var(--crimson);
  border-color: var(--crimson);
  background: var(--crimson-soft);
}
.cg-sidebar__logout-label {
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s;
}
.cg-sidebar--pinned .cg-sidebar__logout-label,
.cg-sidebar:hover .cg-sidebar__logout-label { opacity: 1; }

/* Mobile — hidden */
@media (max-width: 900px) {
  .cg-sidebar { display: none; }
}
`;
