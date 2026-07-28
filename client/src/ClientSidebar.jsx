import { SIDEBAR_CSS } from './Sidebar.jsx';

/**
 * Боковое меню кабинета клиента (/kabinet) — визуально идентично Sidebar админ-панели
 * (тот же SIDEBAR_CSS), но со своим фиксированным набором разделов.
 * Блок «Личный кабинет» в футере открывает обзор со статистикой.
 */
export function ClientSidebar({ tab, onChange, phoneMasked, onOpenCabinet, onSignOut, pinned, onPinnedChange, supportUnread = 0 }) {
  const items = [
    { key: 'invest', label: 'Покупка золота', icon: <IconInvest /> },
    { key: 'history', label: 'Мои сделки', icon: <IconClients /> },
    { key: 'calc', label: 'Калькулятор', icon: <IconCalc /> },
    { key: 'support', label: 'Поддержка', icon: <IconChat />, badge: supportUnread },
    { key: 'settings', label: 'Настройки', icon: <IconSettings /> },
  ];

  return (
    <aside className={`cg-sidebar${pinned ? ' cg-sidebar--pinned' : ''}`}>
      <div className="cg-sidebar__brand">
        <span className="cg-sidebar__brand-mark">
          <img src="/logo-reaktivo-mark.svg" alt="" />
        </span>
        <div className="cg-sidebar__brand-text">
          <span className="cg-sidebar__brand-title">Reaktivo <b>КАБИНЕТ</b></span>
          <span className="cg-sidebar__brand-sub">клиентский доступ</span>
        </div>
        <button
          type="button"
          className="cg-sidebar__brand-pin"
          onClick={() => onPinnedChange?.(!pinned)}
          title={pinned ? 'Свернуть боковое меню' : 'Закрепить меню'}
          aria-pressed={pinned}
        >
          {pinned ? <IconSidebarClose /> : <IconSidebarOpen />}
        </button>
      </div>

      <nav className="cg-sidebar__nav" role="navigation" aria-label="Разделы">
        <div className="cg-sidebar__group">
          <div className="cg-sidebar__group-title">Кабинет</div>
          {items.map((it) => (
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
      </nav>

      <div className="cg-sidebar__footer">
        <button
          type="button"
          className={`cg-sidebar__user${tab === 'home' ? ' cg-sidebar__user--active' : ''}`}
          onClick={() => onOpenCabinet?.()}
          title="Открыть личный кабинет"
        >
          <span className="cg-sidebar__user-avatar" aria-hidden>К</span>
          <div className="cg-sidebar__user-text">
            <span className="cg-sidebar__user-email">{phoneMasked || 'Клиент'}</span>
            <span className="cg-sidebar__user-role">Личный кабинет</span>
          </div>
          <span className="cg-sidebar__user-chevron" aria-hidden>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </span>
        </button>
        <div className="cg-sidebar__footer-actions">
          <a className="cg-sidebar__logout" href="/" title="Вернуться на главную страницу" style={{ textDecoration: 'none', boxSizing: 'border-box' }}>
            <IconHome />
            <span className="cg-sidebar__logout-label">На главную</span>
          </a>
        </div>
        <div className="cg-sidebar__footer-actions">
          <button type="button" className="cg-sidebar__logout" onClick={onSignOut} title="Выйти">
            <IconLogout />
            <span className="cg-sidebar__logout-label">Выйти</span>
          </button>
        </div>
      </div>

      <style>{SIDEBAR_CSS}</style>
      <style>{`
        .cg-sidebar__user--active {
          background: var(--accent-soft);
          border-color: var(--accent-soft);
        }
        .cg-sidebar__user--active .cg-sidebar__user-role { color: var(--accent); }
        /* На ПК меню всегда видно — без «полоски» и сюрпризов при зуме. */
        @media (min-width: 901px) {
          .cg-sidebar {
            transform: translateX(0) !important;
            border-right: 1px solid var(--stroke-soft);
          }
          .cg-sidebar:not(.cg-sidebar--pinned)::after { display: none; }
          .cg-sidebar__brand-text,
          .cg-sidebar__logout-label { opacity: 1 !important; }
        }
      `}</style>
    </aside>
  );
}

export function IconCalc() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}
export function IconClients() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}
export function IconInvest() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h4.5a2.25 2.25 0 0 1 0 4.5H9z" />
      <path d="M9 9v8" />
      <path d="M7.5 15.5H12" />
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
export function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </svg>
  );
}
export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.32H9a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76V9c.4.61 1.01.97 1.69.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}
export function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  );
}
export function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
