import { SIDEBAR_CSS } from './Sidebar.jsx';

/**
 * Боковое меню кабинета клиента (/kabinet) — визуально идентично Sidebar админ-панели
 * (тот же SIDEBAR_CSS), но со своим фиксированным набором разделов и футером
 * без ролей (только маскированный телефон клиента).
 */
export function ClientSidebar({ tab, onChange, phoneMasked, onSignOut, pinned, onPinnedChange }) {
  const items = [
    { key: 'calc', label: 'Калькулятор', icon: <IconCalc /> },
    { key: 'history', label: 'Мои сделки', icon: <IconClients /> },
    { key: 'invest', label: 'Инвестиции', icon: <IconInvest /> },
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
              {tab === it.key && <span className="cg-sidebar__item-dot" aria-hidden />}
            </button>
          ))}
        </div>
      </nav>

      <div className="cg-sidebar__footer">
        <div className="cg-sidebar__user" style={{ cursor: 'default' }}>
          <span className="cg-sidebar__user-avatar" aria-hidden>К</span>
          <div className="cg-sidebar__user-text">
            <span className="cg-sidebar__user-email">{phoneMasked || 'Клиент'}</span>
            <span className="cg-sidebar__user-role">Личный кабинет</span>
          </div>
        </div>
        <div className="cg-sidebar__footer-actions">
          <button type="button" className="cg-sidebar__logout" onClick={onSignOut} title="Выйти">
            <IconLogout />
            <span className="cg-sidebar__logout-label">Выйти</span>
          </button>
        </div>
      </div>

      <style>{SIDEBAR_CSS}</style>
    </aside>
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
function IconClients() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
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
