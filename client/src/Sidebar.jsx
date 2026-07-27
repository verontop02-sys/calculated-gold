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
export function Sidebar({ tab, onChange, user, onSignOut, onPinnedChange, onOpenProfile, supportUnread = 0 }) {
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
    ...(isAdmin ? [{ key: 'employees', label: 'Сделки сотрудников', icon: <IconEmployees /> }] : []),
    ...(isSuper ? [{ key: 'gold-index', label: 'Индекс золота', icon: <IconMap /> }] : []),
    ...(isAdmin ? [{ key: 'fintech-clients', label: 'Клиенты биржи', icon: <IconInvest /> }] : []),
    ...(isAdmin ? [{ key: 'support-chat', label: 'Поддержка', icon: <IconChatBubble />, badge: supportUnread }] : []),
  ];

  const groups = [
    {
      key: 'overview',
      title: 'Обзор',
      items: [
        { key: 'dashboard', label: 'Дашборд', icon: <IconDashboard /> },
      ],
    },
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
          <img src="/logo-reaktivo-mark.svg" alt="" />
        </span>
        <div className="cg-sidebar__brand-text">
          <span className="cg-sidebar__brand-title">Reaktivo <b>PRO</b></span>
          <span className="cg-sidebar__brand-sub">панель оценки</span>
        </div>
        <button
          type="button"
          className="cg-sidebar__brand-pin"
          onClick={() => setPinned((v) => !v)}
          title={pinned ? 'Свернуть боковое меню' : 'Закрепить меню'}
          aria-pressed={pinned}
        >
          {pinned ? <IconSidebarClose /> : <IconSidebarOpen />}
        </button>
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
                {it.badge > 0 && <span className="cg-sidebar__item-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
                {tab === it.key && !(it.badge > 0) && <span className="cg-sidebar__item-dot" aria-hidden />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="cg-sidebar__footer">
        <button
          type="button"
          className="cg-sidebar__user"
          onClick={onOpenProfile}
          title="Открыть профиль"
        >
          <span className="cg-sidebar__user-avatar" aria-hidden>
            {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="cg-sidebar__user-text">
            <span className="cg-sidebar__user-email" title={user?.displayName || user?.email}>
              {user?.displayName || user?.email}
            </span>
            {user?.displayName && (
              <span className="cg-sidebar__user-subemail" title={user?.email}>{user?.email}</span>
            )}
            <span className="cg-sidebar__user-role">{roleLabel(user?.role)}</span>
          </div>
          <span className="cg-sidebar__user-chevron" aria-hidden>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </span>
        </button>
        <div className="cg-sidebar__footer-actions">
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
function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
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
function IconEmployees() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <rect x="15" y="3" width="7" height="9" rx="1.5" />
      <path d="M17.5 6h2M17.5 8.5h2" />
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
function IconInvest() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h4.5a2.25 2.25 0 0 1 0 4.5H9z" />
      <path d="M9 9v8" />
      <path d="M7.5 15.5H12" />
    </svg>
  );
}
function IconChatBubble() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
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
function IconSidebarClose() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9 3v18" />
      <path d="M14 9l-3 3 3 3" />
    </svg>
  );
}
function IconSidebarOpen() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9 3v18" />
      <path d="M11 9l3 3-3 3" />
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

export const SIDEBAR_CSS = `
/* ─── Sidebar — slide-in drawer ────────────────────────────────────────────
   Not pinned: hidden off-screen, 4px accent strip visible as hover trigger.
   Pinned: 240px fixed, content shifted.
   On hover (not pinned): overlays content with full 240px nav.
   ─────────────────────────────────────────────────────────────────────────── */
.cg-sidebar {
  position: fixed;
  top: 0; left: 0;
  width: 240px;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel-solid);
  border-right: 1px solid var(--stroke-soft);
  transform: translateX(calc(-100% + 4px));
  transition: transform 0.26s cubic-bezier(0.4, 0.2, 0.2, 1), box-shadow 0.26s;
  z-index: 50;
}
/* Accent strip — the 4px visible trigger edge */
.cg-sidebar:not(.cg-sidebar--pinned)::after {
  content: '';
  position: absolute;
  right: 0; top: 0;
  width: 4px; height: 100%;
  background: linear-gradient(180deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 50%, transparent) 100%);
  opacity: 0.5;
  transition: opacity 0.2s;
  pointer-events: none;
}
.cg-sidebar:not(.cg-sidebar--pinned):hover::after { opacity: 0; }

.cg-sidebar--pinned { transform: translateX(0); border-right: 1px solid var(--stroke-soft); }
.cg-sidebar:not(.cg-sidebar--pinned):hover {
  transform: translateX(0);
  box-shadow: 6px 0 32px rgba(0,0,0,0.18);
}

.cg-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  height: 60px;
  border-bottom: 1px solid var(--stroke-soft);
  flex-shrink: 0;
}
.cg-sidebar__brand-mark {
  width: 40px; height: 40px;
  border-radius: 11px;
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.cg-sidebar__brand-mark img {
  width: 100%; height: 100%; object-fit: cover;
}
.cg-sidebar__brand-text {
  display: flex; flex-direction: column;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s 0.06s;
  min-width: 0;
  flex: 1;
  overflow: hidden; /* длинный бренд («Reaktivo КАБИНЕТ») не наезжает на кнопку свернуть */
}
.cg-sidebar--pinned .cg-sidebar__brand-text,
.cg-sidebar:hover .cg-sidebar__brand-text { opacity: 1; }
.cg-sidebar__brand-title {
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-strong);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.cg-sidebar__brand-title b {
  color: var(--accent);
  font-weight: 700;
  font-size: 0.7em;
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  letter-spacing: 0.12em;
}
.cg-sidebar__brand-sub {
  font-size: 0.68rem;
  color: var(--text-dim);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Кнопка toggle в шапке ── */
.cg-sidebar__brand-pin {
  flex-shrink: 0;
  width: 32px; height: 32px;
  border-radius: 8px;
  border: 1px solid var(--stroke);
  background: transparent;
  color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s 0.06s, color 0.16s, border-color 0.16s, background 0.16s, transform 0.16s;
}
.cg-sidebar--pinned .cg-sidebar__brand-pin,
.cg-sidebar:hover .cg-sidebar__brand-pin { opacity: 1; }
.cg-sidebar__brand-pin:hover {
  color: var(--accent);
  border-color: var(--accent-soft);
  background: var(--accent-soft);
  transform: scale(1.08);
}
.cg-sidebar__brand-pin:active { transform: scale(0.94); }
.cg-sidebar__brand-pin:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ── Nav ── */
.cg-sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--stroke) transparent;
}
.cg-sidebar__nav::-webkit-scrollbar { width: 4px; }
.cg-sidebar__nav::-webkit-scrollbar-thumb { background: var(--stroke); border-radius: 2px; }

.cg-sidebar__group { display: flex; flex-direction: column; gap: 1px; margin-top: 16px; }
.cg-sidebar__group:first-child { margin-top: 4px; }
.cg-sidebar__group-title {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 0 12px 6px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.18s 0.06s;
  pointer-events: none;
}
.cg-sidebar--pinned .cg-sidebar__group-title,
.cg-sidebar:hover .cg-sidebar__group-title { opacity: 1; }

.cg-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 200ms ease, background 200ms ease;
  width: 100%;
  text-align: left;
}
.cg-sidebar__item:hover {
  color: var(--text);
  background: var(--stroke-soft);
}
.cg-sidebar__item:active { opacity: 0.8; }
.cg-sidebar__item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 8px; }

/* Active: only left bar + colored text — no fill */
.cg-sidebar__item--active {
  color: var(--accent);
  background: var(--accent-soft);
}
.cg-sidebar__item--active .cg-sidebar__item-icon { color: var(--accent); }

.cg-sidebar__item-icon {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  flex-shrink: 0;
  color: inherit;
  transition: color 200ms ease;
}
.cg-sidebar__item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  opacity: 0;
  transition: opacity 0.18s 0.04s;
  letter-spacing: -0.01em;
}
.cg-sidebar--pinned .cg-sidebar__item-label,
.cg-sidebar:hover .cg-sidebar__item-label { opacity: 1; }

.cg-sidebar__item-dot {
  position: absolute;
  left: 0; top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  animation: cgFadeIn 280ms ease;
}

/* Счётчик непрочитанного (чат поддержки) */
.cg-sidebar__item-badge {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 19px;
  height: 19px;
  border-radius: 999px;
  padding: 0 6px;
  background: var(--accent);
  color: #fff;
  font-size: 0.66rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
/* В свёрнутом сайдбаре бейдж — точка на иконке */
.cg-sidebar:not(.cg-sidebar--pinned):not(:hover) .cg-sidebar__item-badge {
  position: absolute;
  top: 6px; right: 6px;
  min-width: 8px; width: 8px; height: 8px;
  padding: 0;
  font-size: 0;
}

/* ── Footer ── */
.cg-sidebar__footer {
  border-top: 1px solid var(--stroke-soft);
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.cg-sidebar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  min-width: 0;
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.16s, border-color 0.16s;
}
.cg-sidebar__user:hover {
  background: var(--accent-soft);
  border-color: var(--stroke-soft);
}
.cg-sidebar__user:hover .cg-sidebar__user-avatar {
  background: var(--accent); color: #fff; border-color: var(--accent);
}
.cg-sidebar__user-chevron {
  margin-left: auto; flex-shrink: 0; color: var(--text-muted);
  opacity: 0; transition: opacity 0.18s 0.06s, transform 0.16s;
}
.cg-sidebar--pinned .cg-sidebar__user-chevron,
.cg-sidebar:hover .cg-sidebar__user-chevron { opacity: 1; }
.cg-sidebar__user:hover .cg-sidebar__user-chevron { color: var(--accent); transform: translateX(2px); }
.cg-sidebar__user-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: var(--stroke);
  color: var(--text);
  font-weight: 700;
  font-size: 0.8rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  border: 1.5px solid var(--stroke-strong);
}
.cg-sidebar__user-text {
  display: flex; flex-direction: column;
  min-width: 0;
  opacity: 0;
  transition: opacity 0.18s 0.06s;
}
.cg-sidebar--pinned .cg-sidebar__user-text,
.cg-sidebar:hover .cg-sidebar__user-text { opacity: 1; }
.cg-sidebar__user-email {
  font-size: 0.75rem;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cg-sidebar__user-subemail {
  font-size: 0.62rem;
  color: var(--text-dim);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cg-sidebar__user-role {
  font-size: 0.64rem;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.cg-sidebar__footer-actions {
  display: flex; gap: 4px; align-items: stretch;
}
.cg-sidebar__logout {
  display: flex; align-items: center; gap: 7px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--stroke);
  background: transparent;
  color: var(--text-dim);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  height: 34px;
  transition: color 0.18s, border-color 0.18s, background 0.18s;
}
.cg-sidebar__logout:hover {
  color: var(--crimson);
  border-color: var(--crimson-soft);
  background: var(--crimson-soft);
}
.cg-sidebar__logout-label {
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
}
.cg-sidebar--pinned .cg-sidebar__logout-label,
.cg-sidebar:hover .cg-sidebar__logout-label { opacity: 1; }

@media (max-width: 900px) { .cg-sidebar { display: none; } }
`;
