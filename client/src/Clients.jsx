import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const PAGE = 80;

/** Короткая дата для списка сделок. */
function dealDateCompact(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortProbeWeight(d) {
  const p = d?.first_probe != null ? d.first_probe : null;
  const w = d?.first_weight_gross != null || d?.first_weight_net != null;
  const parts = [];
  if (p != null) parts.push(`${p}п`);
  if (w) {
    const a = d.first_weight_gross != null ? `${d.first_weight_gross}` : '';
    const b = d.first_weight_net != null ? `${d.first_weight_net}` : '';
    if (a || b) parts.push(a && b ? `${a}/${b}г` : `${a || b}г`);
  }
  return parts.length ? parts.join(' ') : '—';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Clients({ formatMoney, toast }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [deals, setDeals] = useState(null);
  const [dealsBusy, setDealsBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [deletingDealId, setDeletingDealId] = useState(null);

  const loadList = useCallback(
    async (fromOffset) => {
      setListBusy(true);
      try {
        const o = fromOffset != null ? fromOffset : 0;
        const { customers, total: t } = await api.scrapCustomersList({
          q: String(q).trim() || undefined,
          limit: PAGE,
          offset: o,
        });
        if (o === 0) {
          setList(customers || []);
        } else {
          setList((prev) => [...prev, ...(customers || [])]);
        }
        setOffset(o + (customers || []).length);
        setTotal(typeof t === 'number' ? t : o + (customers || []).length);
      } catch (e) {
        toast?.(e?.message || 'Ошибка загрузки', 'error');
      } finally {
        setListBusy(false);
      }
    },
    [q, toast]
  );

  useEffect(() => {
    setOffset(0);
    setList([]);
    setSelected(null);
    setDeals(null);
    const wait = String(q).trim() ? 280 : 0;
    const t = setTimeout(() => {
      loadList(0);
    }, wait);
    return () => clearTimeout(t);
  }, [q, loadList]);

  const loadDeals = useCallback(
    async (c) => {
      if (!c?.id) return;
      setDealsBusy(true);
      setDeals(null);
      try {
        const { deals: d } = await api.scrapDeals({ customerId: c.id, limit: 200, offset: 0 });
        setDeals(d || []);
      } catch (e) {
        setDeals([]);
        toast?.(e?.message || 'Не удалось загрузить сделки', 'error');
      } finally {
        setDealsBusy(false);
      }
    },
    [toast]
  );

  const select = useCallback(
    (c) => {
      if (!c?.id) return;
      setSelected(c);
      loadDeals(c);
    },
    [loadDeals]
  );

  const canLoadMore = list.length < total;

  async function onDownloadPdf(d) {
    if (!d?.id) return;
    setPdfBusyId(d.id);
    try {
      const blob = await api.scrapDealPdf(d.id);
      const name = `dogovor-${String(d.id).slice(0, 8)}.pdf`;
      downloadBlob(blob, name);
      toast?.('PDF скачан', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось скачать PDF', 'error');
    } finally {
      setPdfBusyId(null);
    }
  }

  async function onDeleteDeal(d) {
    if (!d?.id) return;
    if (
      !window.confirm(
        'Удалить эту запись о сделке из учёта? Восстановить её нельзя.'
      )
    ) {
      return;
    }
    setDeletingDealId(d.id);
    try {
      await api.deleteScrapDeal(d.id);
      setDeals((prev) => (prev || []).filter((x) => x.id !== d.id));
      toast?.('Сделка удалена', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось удалить', 'error');
    } finally {
      setDeletingDealId(null);
    }
  }

  return (
    <div className="clients-root glass">
      <div className="clients-head">
        <h2 className="clients-title">Клиенты</h2>
        <p className="muted small clients-sub">
          Поиск по ФИО или телефону. Сделки появляются после скачивания PDF в «Договоре».
        </p>
      </div>
      <div className="clients-search">
        <input
          className="clients-input"
          placeholder="Телефон или ФИО…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {listBusy && <span className="muted small">загрузка…</span>}
      </div>
      <div className="clients-grid">
        <div className="clients-col">
          <div className="clients-col-label muted small">Список ({list.length} из {total})</div>
          <div className="clients-list">
            {list.length === 0 && !listBusy && <p className="muted">Нет записей</p>}
            {list.map((c) => {
              const active = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`clients-row${active ? ' clients-row--active' : ''}`}
                  onClick={() => select(c)}
                >
                  <span className="clients-row-name">{c.full_name || '—'}</span>
                  <span className="clients-row-phone muted small">{c.phone || '—'}</span>
                </button>
              );
            })}
          </div>
          {canLoadMore && (
            <button type="button" className="btn-secondary clients-more" onClick={() => loadList(offset)} disabled={listBusy}>
              {listBusy ? '…' : 'Показать ещё'}
            </button>
          )}
        </div>
        <div className="clients-detail">
          {!selected && <p className="muted clients-placeholder">Выберите клиента слева</p>}
          {selected && (
            <>
              <div className="clients-card">
                <h3 className="clients-d-name">{selected.full_name || '—'}</h3>
                <p className="clients-d-line">
                  <span className="muted">Тел.</span> {selected.phone || '—'}
                </p>
                <p className="clients-d-line">
                  <span className="muted">Паспорт</span> {selected.passport_line || '—'}
                </p>
                <p className="clients-d-addr">
                  <span className="muted">Адрес</span> {selected.address || '—'}
                </p>
              </div>
              <div className="clients-deals-head">
                <span className="muted small">Сделки / договоры</span>
                {dealsBusy && <span className="muted small">загрузка…</span>}
              </div>
              {!dealsBusy && (!deals || deals.length === 0) && (
                <p className="muted small">Пока нет сделок по этой карточке</p>
              )}
              {deals && deals.length > 0 && (
                <ul className="clients-deal-list" aria-label="Сделки по клиенту">
                  {deals.map((d) => (
                    <li key={d.id} className="clients-deal-block">
                      <div className="clients-deal-info">
                        <div className="clients-deal-line1">
                          <span className="mono-nums clients-deal-date">{dealDateCompact(d.created_at)}</span>
                          <span className="clients-deal-sep muted" aria-hidden>
                            ·
                          </span>
                          <span className="muted small">
                            дог. № <span className="clients-deal-no">{d.contract_no || '—'}</span>
                          </span>
                          <span className="badge ok clients-deal-badge" title="Договор в системе">
                            в базе
                          </span>
                        </div>
                        <div className="clients-deal-line2">
                          <span className="mono-nums clients-deal-sum">
                            {d.total_rub != null ? formatMoney(d.total_rub) : '—'}
                          </span>
                          <span className="muted small clients-deal-probe">{shortProbeWeight(d)}</span>
                        </div>
                      </div>
                      <div className="clients-deal-actions">
                        <button
                          type="button"
                          className="btn-ghost small clients-pdf"
                          onClick={() => onDownloadPdf(d)}
                          disabled={pdfBusyId === d.id}
                        >
                          {pdfBusyId === d.id ? '…' : 'Скачать PDF'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost small clients-deal-del"
                          onClick={() => onDeleteDeal(d)}
                          disabled={deletingDealId === d.id}
                          title="Удалить сделку из учёта"
                        >
                          {deletingDealId === d.id ? '…' : 'Удалить'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`
        .clients-root {
          padding: 20px 18px;
          border-radius: 16px;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .clients-head { margin-bottom: 14px; }
        .clients-title { font-size: 1.2rem; margin: 0 0 6px; font-weight: 600; }
        .clients-sub { margin: 0; line-height: 1.4; }
        .clients-search {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border, rgba(255, 255, 255, 0.18));
          background: var(--input-bg, rgba(0, 0, 0, 0.2));
          box-shadow: 0 0 0 1px rgba(184, 134, 11, 0.12) inset;
        }
        .clients-input {
          flex: 1;
          min-width: 0;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--border, rgba(255,255,255,0.14));
          background: var(--input-bg, rgba(0,0,0,0.12));
          color: inherit;
          font-size: 0.95rem;
        }
        .clients-grid {
          display: grid;
          grid-template-columns: minmax(200px, 0.42fr) minmax(0, 1fr);
          gap: 16px 20px;
          align-items: start;
          min-width: 0;
          max-width: 100%;
        }
        @media (min-width: 1100px) {
          .clients-grid {
            grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
          }
        }
        .clients-col,
        .clients-detail {
          min-width: 0;
          max-width: 100%;
          overflow-x: hidden;
        }
        @media (max-width: 720px) {
          .clients-grid { grid-template-columns: 1fr; }
        }
        .clients-col-label { margin-bottom: 8px; }
        .clients-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: min(52vh, 480px);
          overflow-y: auto;
        }
        .clients-row {
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
        }
        .clients-row:hover {
          background: rgba(255,255,255,0.04);
        }
        .clients-row--active {
          border-color: rgba(184, 134, 11, 0.45);
          background: rgba(184, 134, 11, 0.08);
          box-shadow: inset 3px 0 0 var(--gold, #b8860b);
        }
        .clients-row-name { font-weight: 500; }
        .clients-more { width: 100%; margin-top: 10px; }
        .clients-placeholder { margin: 24px 0; }
        .clients-d-name { margin: 0 0 8px; font-size: 1.05rem; }
        .clients-card {
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          background: var(--input-bg, rgba(0,0,0,0.12));
          margin-bottom: 4px;
        }
        .clients-d-line, .clients-d-addr { margin: 0 0 6px; font-size: 0.9rem; line-height: 1.45; word-break: break-word; }
        .clients-d-line .muted,
        .clients-d-addr .muted {
          min-width: 4.5rem;
          display: inline-block;
          opacity: 0.95;
        }
        .clients-d-addr { margin-top: 8px; }
        .clients-deals-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin: 14px 0 10px;
        }
        .clients-deal-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: min(56vh, 560px);
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }
        .clients-deal-block {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px 14px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          background: var(--input-bg, rgba(0,0,0,0.12));
        }
        .clients-deal-info {
          flex: 1 1 220px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .clients-deal-line1 {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 10px;
          font-size: 0.82rem;
          line-height: 1.35;
        }
        .clients-deal-date { font-size: 0.84rem; }
        .clients-deal-sep { user-select: none; }
        .clients-deal-no { font-weight: 500; color: var(--text, inherit); }
        .clients-deal-badge { flex-shrink: 0; }
        .clients-deal-line2 {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 8px 14px;
        }
        .clients-deal-sum {
          font-size: 1rem;
          font-weight: 700;
          color: var(--gold, #e8c547);
          letter-spacing: 0.02em;
        }
        .clients-deal-probe {
          flex: 1;
          min-width: 0;
          word-break: break-word;
          line-height: 1.35;
        }
        .clients-deal-actions {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .clients-deal-del {
          color: #f87171;
          border-color: rgba(248,113,113,0.35) !important;
        }
        .clients-deal-del:hover {
          color: #ef4444 !important;
        }
        .clients-pdf {
          padding: 6px 10px;
          font-size: 0.8rem;
        }
        @media (max-width: 520px) {
          .clients-deal-actions {
            width: 100%;
            justify-content: stretch;
          }
          .clients-deal-actions .btn-ghost {
            flex: 1;
            min-width: 0;
          }
        }
        .badge.ok {
          display: inline-block;
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(60, 180, 100, 0.2);
          color: var(--ok, #8fd4a0);
        }
      `}</style>
    </div>
  );
}
