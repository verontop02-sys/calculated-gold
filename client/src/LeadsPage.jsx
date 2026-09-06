import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

/**
 * Заявки с лендингов reaktivo.ru / reaktivo.pro: список, статусы, кто обработал.
 * Новые заявки создаёт публичный эндпоинт /api/public/landing-lead.
 *
 * Карточки в списке — компактные (не хотим «кашу» из всех полей сразу), по клику
 * открывается модалка с полной информацией и действиями по заявке.
 */

const SOURCE_META = {
  prodat: { label: 'Продать золото', color: '#c81e22' },
  kurier: { label: 'Курьер', color: '#0891b2' },
  agenty: { label: 'Агенты', color: '#1f9d55' },
  slitki: { label: 'Слитки', color: '#b8860b' },
  resale: { label: 'Resale', color: '#7c4dbe' },
  franshiza: { label: 'Франшиза', color: '#2563eb' },
  partneram: { label: 'B2B', color: '#0e7490' },
  komanda: { label: 'Команда', color: '#ea580c' },
  'pismo-ceo': { label: 'Письмо CEO', color: '#be123c' },
  pro: { label: 'reaktivo.pro', color: '#64748b' },
};

const STATUS_TABS = [
  { key: 'new', label: 'Новые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'done', label: 'Обработанные' },
  { key: 'all', label: 'Все' },
];

const STATUS_LABEL = { new: 'Новая', in_progress: 'В работе', done: 'Обработана' };

function leadDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `сегодня ${time}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `вчера ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ${time}`;
}

/** Похоже на ссылку на фото (заявка на курьера может приложить фото изделия). */
function isPhotoUrl(value) {
  return /^https?:\/\/\S+\.(jpe?g|png|webp|gif)(\?\S*)?$/i.test(String(value || '').trim());
}

function ContactLink({ value }) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return <a className="cg-leads__contact" href={`tel:+${digits.replace(/^8/, '7')}`}>{value}</a>;
  }
  const tg = String(value || '').trim();
  if (/^@[\w\d_]{3,}$/.test(tg)) {
    return <a className="cg-leads__contact" href={`https://t.me/${tg.slice(1)}`} target="_blank" rel="noreferrer">{tg}</a>;
  }
  return <span className="cg-leads__contact">{value}</span>;
}

/** Модалка с полной карточкой заявки: все поля, статус, действия. */
function LeadModal({ lead, busy, onClose, onSetStatus }) {
  const meta = SOURCE_META[lead.source] || { label: lead.source, color: '#64748b' };
  const fields = lead.fields && typeof lead.fields === 'object' ? Object.entries(lead.fields) : [];

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cg-leads__overlay" role="dialog" aria-modal="true" aria-label="Заявка" onClick={onClose}>
      <div className="cg-leads__modal" onClick={(e) => e.stopPropagation()}>
        <div className="cg-leads__modal-head">
          <div className="cg-leads__top">
            <span className="cg-leads__source" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)` }}>
              {meta.label}
            </span>
            <span className="cg-leads__date">{leadDate(lead.created_at)}</span>
            {lead.status !== 'new' && (
              <span className={`cg-leads__status cg-leads__status--${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
            )}
          </div>
          <button type="button" className="cg-leads__modal-close" onClick={onClose} aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="cg-leads__person cg-leads__person--modal">
          <strong className="cg-leads__name">{lead.name}</strong>
          <ContactLink value={lead.phone} />
        </div>

        {fields.length > 0 && (
          <dl className="cg-leads__fields cg-leads__fields--modal">
            {fields.map(([k, v]) => (
              <div key={k} className="cg-leads__field cg-leads__field--modal">
                <dt>{k}</dt>
                {isPhotoUrl(v) ? (
                  <dd>
                    <a className="cg-leads__photo-link" href={v} target="_blank" rel="noreferrer">
                      <img className="cg-leads__photo-thumb" src={v} alt="Фото изделия" loading="lazy" />
                      Открыть в полном размере
                    </a>
                  </dd>
                ) : (
                  <dd>{v}</dd>
                )}
              </div>
            ))}
          </dl>
        )}

        {lead.status === 'done' && lead.processed_by_name && (
          <p className="cg-leads__processed">Обработал(а) {lead.processed_by_name} · {leadDate(lead.processed_at)}</p>
        )}

        <div className="cg-leads__actions cg-leads__actions--modal">
          {lead.status === 'new' && (
            <>
              <button type="button" className="cg-leads__btn" disabled={busy} onClick={() => onSetStatus(lead, 'in_progress')}>В работу</button>
              <button type="button" className="cg-leads__btn cg-leads__btn--primary" disabled={busy} onClick={() => onSetStatus(lead, 'done')}>Готово</button>
            </>
          )}
          {lead.status === 'in_progress' && (
            <>
              <button type="button" className="cg-leads__btn" disabled={busy} onClick={() => onSetStatus(lead, 'new')}>Вернуть</button>
              <button type="button" className="cg-leads__btn cg-leads__btn--primary" disabled={busy} onClick={() => onSetStatus(lead, 'done')}>Готово</button>
            </>
          )}
          {lead.status === 'done' && (
            <button type="button" className="cg-leads__btn" disabled={busy} onClick={() => onSetStatus(lead, 'new')}>Вернуть в новые</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LeadsPage({ toast }) {
  const [filter, setFilter] = useState('new');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const out = await api.landingLeads(filter === 'all' ? 'all' : filter);
      setLeads(out.leads || []);
      setErr('');
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить заявки');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const visibleLeads = useMemo(
    () => (sourceFilter === 'all' ? leads : leads.filter((l) => l.source === sourceFilter)),
    [leads, sourceFilter]
  );

  // Источники строим из того, что реально встречается в текущей выборке — не показываем
  // пустые пункты фильтра для форм, с которых заявок ещё не было.
  const availableSources = useMemo(() => {
    const set = new Set(leads.map((l) => l.source));
    return Array.from(set);
  }, [leads]);

  const openLead = leads.find((l) => l.id === openLeadId) || null;

  async function setStatus(lead, status) {
    setBusyId(lead.id);
    try {
      const out = await api.landingLeadSetStatus(lead.id, status);
      // В отфильтрованном списке заявка со сменённым статусом уходит из выборки.
      setLeads((prev) => prev
        .map((l) => (l.id === lead.id ? out.lead : l))
        .filter((l) => filter === 'all' || l.status === filter));
      if (filter !== 'all') setOpenLeadId(null);
      toast?.(status === 'done' ? 'Заявка отмечена обработанной' : status === 'in_progress' ? 'Заявка взята в работу' : 'Заявка возвращена в новые', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось обновить заявку', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="cg-leads">
      <div className="cg-leads__toolbar">
        <div className="cg-leads__tabs" role="tablist" aria-label="Фильтр по статусу">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              className={`cg-leads__tab${filter === t.key ? ' cg-leads__tab--active' : ''}`}
              onClick={() => setFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          className="cg-leads__source-filter"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Фильтр по странице/форме"
        >
          <option value="all">Все страницы</option>
          {availableSources.map((s) => (
            <option key={s} value={s}>{SOURCE_META[s]?.label || s}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="cg-leads__list">
          {[0, 1, 2].map((i) => <div key={i} className="cg-leads__card cg-leads__card--skeleton" />)}
        </div>
      )}

      {!loading && err && (
        <div className="cg-leads__empty">
          <p>{err}</p>
          <button type="button" className="cg-leads__btn" onClick={() => load()}>Повторить</button>
        </div>
      )}

      {!loading && !err && visibleLeads.length === 0 && (
        <div className="cg-leads__empty">
          <span className="cg-leads__empty-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-6l-2 3h-4l-2-3H2" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </span>
          <p>{leads.length > 0 ? 'Нет заявок с этой страницы.' : filter === 'new' ? 'Новых заявок нет — все разобраны.' : 'Здесь пока пусто.'}</p>
        </div>
      )}

      {!loading && !err && visibleLeads.length > 0 && (
        <div className="cg-leads__list">
          {visibleLeads.map((lead) => {
            const meta = SOURCE_META[lead.source] || { label: lead.source, color: '#64748b' };
            return (
              <article
                key={lead.id}
                className={`cg-leads__card cg-leads__card--${lead.status}`}
                onClick={() => setOpenLeadId(lead.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLeadId(lead.id); } }}
              >
                <div className="cg-leads__main">
                  <div className="cg-leads__top">
                    <span className="cg-leads__source" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)` }}>
                      {meta.label}
                    </span>
                    <span className="cg-leads__date">{leadDate(lead.created_at)}</span>
                    {lead.status !== 'new' && (
                      <span className={`cg-leads__status cg-leads__status--${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
                    )}
                  </div>
                  <div className="cg-leads__person">
                    <strong className="cg-leads__name">{lead.name}</strong>
                    <span className="cg-leads__contact cg-leads__contact--plain">{lead.phone}</span>
                  </div>
                </div>
                <svg className="cg-leads__chevron" aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </article>
            );
          })}
        </div>
      )}

      {openLead && (
        <LeadModal
          lead={openLead}
          busy={busyId === openLead.id}
          onClose={() => setOpenLeadId(null)}
          onSetStatus={setStatus}
        />
      )}

      <style>{LEADS_CSS}</style>
    </div>
  );
}

const LEADS_CSS = `
.cg-leads { display: flex; flex-direction: column; gap: 14px; }

.cg-leads__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.cg-leads__tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.cg-leads__tab {
  padding: 7px 14px; border-radius: 999px; border: 1px solid var(--stroke);
  background: transparent; color: var(--text-muted); font: inherit; font-size: 0.82rem;
  font-weight: 600; cursor: pointer; transition: color 0.16s, border-color 0.16s, background 0.16s;
}
.cg-leads__tab:hover { color: var(--text); border-color: var(--stroke-strong); }
.cg-leads__tab--active { color: var(--accent); background: var(--accent-soft); border-color: var(--accent-soft); }

.cg-leads__source-filter {
  padding: 8px 12px; border-radius: 10px; border: 1px solid var(--stroke); background: var(--bg-panel-solid);
  color: var(--text-strong); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer;
}

.cg-leads__list { display: flex; flex-direction: column; gap: 8px; }

.cg-leads__card {
  display: flex; gap: 12px; align-items: center; justify-content: space-between;
  background: var(--bg-panel); border: 1px solid var(--stroke); border-radius: 12px;
  padding: 11px 14px; animation: cgFadeIn 240ms ease; cursor: pointer;
  transition: border-color 0.16s, background 0.16s, transform 0.12s;
}
.cg-leads__card:hover { border-color: var(--stroke-strong); background: var(--stroke-soft); }
.cg-leads__card:active { transform: scale(0.995); }
.cg-leads__card--skeleton { height: 58px; border-style: dashed; opacity: 0.5; animation: cgLeadsPulse 1.2s ease-in-out infinite; cursor: default; }
@keyframes cgLeadsPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.6; } }

.cg-leads__chevron { color: var(--text-dim); flex-shrink: 0; }

.cg-leads__main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 5px; }
.cg-leads__top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cg-leads__source {
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em;
  padding: 3px 9px; border-radius: 999px; border: 1px solid transparent;
}
.cg-leads__date { font-size: 0.74rem; color: var(--text-dim); }
.cg-leads__status { font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
.cg-leads__status--in_progress { color: #b45309; background: color-mix(in srgb, #f59e0b 14%, transparent); }
.cg-leads__status--done { color: #15803d; background: color-mix(in srgb, #22c55e 14%, transparent); }

.cg-leads__person { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.cg-leads__person--modal { margin-top: 4px; }
.cg-leads__name { font-size: 0.95rem; color: var(--text-strong); letter-spacing: -0.01em; }
.cg-leads__contact { font-size: 0.86rem; color: var(--text); text-decoration: none; border-bottom: 1px dashed var(--stroke-strong); }
.cg-leads__contact--plain { border-bottom: none; color: var(--text-muted); }
a.cg-leads__contact:hover { color: var(--accent); border-bottom-color: var(--accent); }

.cg-leads__fields { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; }
.cg-leads__fields--modal { display: flex; flex-direction: column; gap: 10px; margin: 16px 0 0; padding: 14px; background: var(--bg-panel-solid); border: 1px solid var(--stroke); border-radius: 12px; }
.cg-leads__field { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
.cg-leads__field--modal { flex-direction: column; gap: 2px; align-items: flex-start; }
.cg-leads__field dt { font-size: 0.74rem; color: var(--text-dim); white-space: nowrap; }
.cg-leads__field--modal dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; }
.cg-leads__field dd { margin: 0; font-size: 0.82rem; color: var(--text); overflow-wrap: anywhere; }
.cg-leads__field--modal dd { font-size: 0.92rem; color: var(--text-strong); }
.cg-leads__photo-link {
  display: inline-flex; align-items: center; gap: 8px; color: var(--accent); text-decoration: none;
  font-weight: 600; border-bottom: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent);
}
.cg-leads__photo-link:hover { color: var(--accent-strong, var(--accent)); }
.cg-leads__photo-thumb {
  width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid var(--stroke); flex-shrink: 0;
}

.cg-leads__processed { margin: 12px 0 0; font-size: 0.74rem; color: var(--text-dim); }

.cg-leads__actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.cg-leads__actions--modal { margin-top: 18px; justify-content: stretch; }
.cg-leads__actions--modal .cg-leads__btn { flex: 1; justify-content: center; display: flex; align-items: center; }
.cg-leads__btn {
  padding: 9px 14px; border-radius: 9px; border: 1px solid var(--stroke);
  background: transparent; color: var(--text); font: inherit; font-size: 0.84rem; font-weight: 600;
  cursor: pointer; transition: border-color 0.16s, background 0.16s, color 0.16s, opacity 0.16s;
  white-space: nowrap;
}
.cg-leads__btn:hover:not(:disabled) { border-color: var(--stroke-strong); background: var(--stroke-soft); }
.cg-leads__btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.cg-leads__btn--primary:hover:not(:disabled) { background: var(--accent-strong, var(--accent)); border-color: var(--accent-strong, var(--accent)); }
.cg-leads__btn:disabled { opacity: 0.55; cursor: default; }

.cg-leads__empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px 20px; border: 1px dashed var(--stroke); border-radius: 14px;
  color: var(--text-muted); text-align: center;
}
.cg-leads__empty p { margin: 0; font-size: 0.9rem; }
.cg-leads__empty-icon { color: var(--text-dim); }

.cg-leads__overlay {
  position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 20px; animation: cgFadeIn 160ms ease both;
}
.cg-leads__modal {
  width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto;
  background: var(--bg-panel); border: 1px solid var(--stroke); border-radius: 18px;
  padding: 20px 22px 22px; box-shadow: 0 24px 60px -20px rgba(0,0,0,0.5);
  animation: cgLeadsModalIn 200ms cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes cgLeadsModalIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
.cg-leads__modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.cg-leads__modal-close {
  border: none; background: var(--stroke-soft); color: var(--text-muted); border-radius: 8px;
  padding: 6px; cursor: pointer; flex-shrink: 0; display: flex; transition: color 0.16s, background 0.16s;
}
.cg-leads__modal-close:hover { color: var(--text-strong); background: var(--stroke); }

@media (max-width: 720px) {
  .cg-leads__toolbar { flex-direction: column; align-items: stretch; }
  .cg-leads__source-filter { width: 100%; }
  .cg-leads__modal { max-width: 100%; border-radius: 16px; }
}
`;
