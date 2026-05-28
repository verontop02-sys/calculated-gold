/**
 * Универсальный «пустой» экран с иллюстрацией.
 *
 * Применять везде, где раньше был сухой текст «Нет записей» / «Пока нет данных».
 *
 * <EmptyState
 *   icon="clients"
 *   title="Здесь пока пусто"
 *   description="Клиенты появятся автоматически после первой сделки."
 *   action={{ label: 'Создать договор', onClick: goToContract }}
 * />
 *
 * @param icon ключ встроенной иллюстрации (clients/deals/cities/history/search/users/calc/map)
 * @param title заголовок
 * @param description описание под заголовком (рекомендация что делать)
 * @param action опционально: { label, onClick, kind?: 'primary'|'ghost' }
 * @param compact компактный режим — для боковых панелей / маленьких контейнеров
 * @param tone 'default' | 'emerald' (зелёный «успокаивающий» вариант)
 */
export function EmptyState({ icon = 'box', title, description, action, compact = false, tone = 'default' }) {
  const Illustration = ILLUSTRATIONS[icon] || ILLUSTRATIONS.box;
  return (
    <div className={`cg-empty${compact ? ' cg-empty--compact' : ''}${tone === 'emerald' ? ' cg-empty--emerald' : ''}`}>
      <div className="cg-empty__illu" aria-hidden>
        <Illustration />
      </div>
      {title && <h3 className="cg-empty__title">{title}</h3>}
      {description && <p className="cg-empty__desc">{description}</p>}
      {action && (
        <button
          type="button"
          className={`cg-empty__btn${action.kind === 'ghost' ? ' cg-empty__btn--ghost' : ''}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}

      <style>{EMPTY_CSS}</style>
    </div>
  );
}

// ── ILLUSTRATIONS (inline SVG) ───────────────────────────────────────────────
const sw = 'currentColor';

function Clients() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold)" stroke="none" />
      <circle cx="48" cy="50" r="11" strokeWidth="2.4" />
      <path d="M30 90c1.5-9.5 9.5-16 18-16s16.5 6.5 18 16" strokeWidth="2.4" />
      <circle cx="78" cy="40" r="8" strokeWidth="2.2" opacity="0.6" />
      <path d="M70 78c.8-6 5.5-10.5 10-11" strokeWidth="2.2" opacity="0.6" />
    </svg>
  );
}

function Deals() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold2)" stroke="none" />
      <rect x="32" y="30" width="56" height="64" rx="6" strokeWidth="2.4" />
      <path d="M44 46h22M44 56h32M44 66h22M44 76h28" strokeWidth="2.2" />
      <circle cx="80" cy="78" r="10" strokeWidth="2.4" fill="var(--bg-panel-solid)" />
      <path d="M76 78l3 3 5-5" strokeWidth="2.2" stroke="var(--emerald)" />
    </svg>
  );
}

function Cities() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold3)" stroke="none" />
      <path d="M16 88l22-10 24 10 22-10v-44l-22 10-24-10-22 10v44z" strokeWidth="2.2" />
      <path d="M38 78V36M62 88V46" strokeWidth="2" />
      <circle cx="74" cy="52" r="5" strokeWidth="2.4" fill="var(--gold)" stroke="none" opacity="0.85" />
      <path d="M74 47l3 5h-6z" strokeWidth="1.8" stroke="var(--gold)" fill="var(--gold)" opacity="0.85" />
    </svg>
  );
}

function History() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold4)" stroke="none" />
      <circle cx="60" cy="60" r="26" strokeWidth="2.4" />
      <path d="M60 42v18l12 6" strokeWidth="2.4" />
      <path d="M28 60a32 32 0 1 1 8 21" strokeWidth="2" />
      <path d="M28 60v-9l-5 6 9 0z" strokeWidth="1.8" fill={sw} />
    </svg>
  );
}

function Search() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold5)" stroke="none" />
      <circle cx="54" cy="54" r="20" strokeWidth="2.6" />
      <path d="M70 70l16 16" strokeWidth="3" />
      <circle cx="54" cy="54" r="6" strokeWidth="2" opacity="0.4" />
    </svg>
  );
}

function Chart() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold6)" stroke="none" />
      <path d="M22 86h76" strokeWidth="2.4" />
      <path d="M22 86V32" strokeWidth="2.4" />
      <rect x="32" y="62" width="10" height="22" rx="2" strokeWidth="2.2" />
      <rect x="48" y="48" width="10" height="36" rx="2" strokeWidth="2.2" />
      <rect x="64" y="56" width="10" height="28" rx="2" strokeWidth="2.2" />
      <rect x="80" y="40" width="10" height="44" rx="2" strokeWidth="2.2" stroke="var(--gold)" fill="var(--gold-soft)" />
    </svg>
  );
}

function Users() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold7" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold7)" stroke="none" />
      <circle cx="46" cy="48" r="10" strokeWidth="2.4" />
      <path d="M28 88c1-10 8-17 18-17s17 7 18 17" strokeWidth="2.4" />
      <circle cx="76" cy="44" r="7" strokeWidth="2.2" opacity="0.7" />
      <path d="M72 86c.5-7 4-11 8-12" strokeWidth="2.2" opacity="0.7" />
      <path d="M86 36l4 4 8-8" strokeWidth="2.4" stroke="var(--emerald)" />
    </svg>
  );
}

function Box() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke={sw} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="cg-empty-gold8" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="50" fill="url(#cg-empty-gold8)" stroke="none" />
      <path d="M30 46l30-14 30 14v34l-30 14-30-14z" strokeWidth="2.4" />
      <path d="M30 46l30 14 30-14M60 60v34" strokeWidth="2.4" />
    </svg>
  );
}

const ILLUSTRATIONS = {
  clients: Clients,
  deals: Deals,
  cities: Cities,
  history: History,
  search: Search,
  chart: Chart,
  users: Users,
  box: Box,
};

const EMPTY_CSS = `
.cg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 24px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px dashed var(--stroke-strong);
  color: var(--text);
  gap: 8px;
  animation: cgEmptyIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes cgEmptyIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.cg-empty__illu {
  color: var(--gold);
  margin-bottom: 6px;
  filter: drop-shadow(0 6px 18px var(--gold-glow));
}
.cg-empty__illu svg { display: block; }
.cg-empty__title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}
.cg-empty__desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-muted);
  max-width: 32rem;
}
.cg-empty__btn {
  margin-top: 12px;
  padding: 10px 20px;
  border-radius: 999px;
  border: 1px solid var(--gold);
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: #1c1108;
  font-weight: 700;
  font-size: 0.88rem;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 4px 16px var(--gold-glow);
  transition: transform 0.12s, box-shadow 0.18s;
}
.cg-empty__btn:hover { box-shadow: 0 6px 22px var(--gold-glow); }
.cg-empty__btn:active { transform: scale(0.97); }
.cg-empty__btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.cg-empty__btn--ghost {
  background: transparent;
  color: var(--gold);
  box-shadow: none;
}
.cg-empty__btn--ghost:hover { background: var(--gold-soft); }

.cg-empty--emerald { border-color: var(--emerald); background: var(--emerald-soft); }
.cg-empty--emerald .cg-empty__illu { color: var(--emerald); filter: drop-shadow(0 6px 18px rgba(30,107,79,0.3)); }
.cg-empty--emerald .cg-empty__title { color: var(--emerald); }

.cg-empty--compact {
  padding: 20px 16px;
  gap: 4px;
}
.cg-empty--compact .cg-empty__illu svg { width: 72px; height: 72px; }
.cg-empty--compact .cg-empty__title { font-size: 0.98rem; }
.cg-empty--compact .cg-empty__desc { font-size: 0.82rem; }

@media (max-width: 600px) {
  .cg-empty { padding: 28px 18px; }
  .cg-empty__illu svg { width: 96px; height: 96px; }
  .cg-empty__title { font-size: 1.05rem; }
}
`;
