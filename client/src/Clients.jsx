import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const PAGE = 80;

function dealDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortProbeWeight(d) {
  const p = d?.first_probe != null ? d.first_probe : null;
  const w = d?.first_weight_gross != null || d?.first_weight_net != null;
  const parts = [];
  if (p != null) parts.push(`${p} пр`);
  if (w) {
    const a = d.first_weight_gross != null ? `${d.first_weight_gross}` : '';
    const b = d.first_weight_net != null ? `${d.first_weight_net}` : '';
    if (a || b) parts.push(a && b ? `${a}/${b} г` : `${a || b} г`);
  }
  return parts.length ? parts.join(' · ') : '—';
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
                <>
                  <div className="clients-deals-table-wrap clients-deals--table" role="region" aria-label="Таблица сделок">
                    <table className="clients-deals">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>№</th>
                          <th>Сумма</th>
                          <th>Позиция</th>
                          <th>Статус</th>
                          <th>PDF</th>
                          <th> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {deals.map((d) => (
                          <tr key={d.id}>
                            <td className="mono-nums clients-deal-cell-date">{dealDate(d.created_at)}</td>
                            <td>{d.contract_no || '—'}</td>
                            <td className="mono-nums">{d.total_rub != null ? formatMoney(d.total_rub) : '—'}</td>
                            <td className="small clients-deal-cell-pos">{shortProbeWeight(d)}</td>
                            <td>
                              <span className="badge ok" title="Договор в системе">
                                в базе
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-ghost small clients-pdf"
                                onClick={() => onDownloadPdf(d)}
                                disabled={pdfBusyId === d.id}
                              >
                                {pdfBusyId === d.id ? '…' : 'Скачать'}
                              </button>
                            </td>
                            <td className="clients-deal-del-wrap">
                              <button
                                type="button"
                                className="btn-ghost small clients-deal-del"
                                onClick={() => onDeleteDeal(d)}
                                disabled={deletingDealId === d.id}
                                title="Удалить сделку из учёта"
                              >
                                {deletingDealId === d.id ? '…' : 'Уд.'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="clients-deal-cards" aria-label="Список сделок">
                    {deals.map((d) => (
                      <li key={d.id} className="clients-deal-item">
                        <div className="clients-deal-item-row">
                          <span className="muted">Дата</span>
                          <span className="mono-nums clients-deal-item-v">{dealDate(d.created_at)}</span>
                        </div>
                        <div className="clients-deal-item-row">
                          <span className="muted">Дог. №</span>
                          <span className="clients-deal-item-v">{d.contract_no || '—'}</span>
                        </div>
                        <div className="clients-deal-item-row">
                          <span className="muted">Сумма</span>
                          <span className="mono-nums clients-deal-item-v">
                            {d.total_rub != null ? formatMoney(d.total_rub) : '—'}
                          </span>
                        </div>
                        <div className="clients-deal-item-row">
                          <span className="muted">Позиция</span>
                          <span className="clients-deal-item-v clients-deal-item-pos">{shortProbeWeight(d)}</span>
                        </div>
                        <div className="clients-deal-item-foot">
                          <span className="badge ok" title="Договор в системе">
                            в базе
                          </span>
                          <div className="clients-deal-item-btns">
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
                            >
                              {deletingDealId === d.id ? '…' : 'Удалить'}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
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
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 18px;
          align-items: start;
          min-width: 0;
          max-width: 100%;
        }
        .clients-col,
        .clients-detail {
          min-width: 0;
          max-width: 100%;
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
          border-color: var(--border, rgba(255,255,255,0.2));
          background: rgba(255,255,255,0.06);
        }
        .clients-row-name { font-weight: 500; }
        .clients-more { width: 100%; margin-top: 10px; }
        .clients-placeholder { margin: 24px 0; }
        .clients-d-name { margin: 0 0 8px; font-size: 1.05rem; }
        .clients-d-line, .clients-d-addr { margin: 0 0 6px; font-size: 0.9rem; line-height: 1.45; word-break: break-word; }
        .clients-d-addr { margin-top: 8px; }
        .clients-deals-head {
          display: flex;
          justify-content: space-between;
          margin: 16px 0 8px;
        }
        .clients-deals-table-wrap {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          border-radius: 10px;
          border: 1px solid var(--border, rgba(255,255,255,0.1));
        }
        .clients-deal-item-btns { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .clients-deal-del { color: #f87171; border-color: rgba(248,113,113,0.35) !important; }
        .clients-deal-del:hover { color: #ef4444 !important; }
        .clients-deal-del-wrap { width: 2.75rem; }
        .clients-deals {
          width: 100%;
          min-width: 600px;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .clients-deals th,
        .clients-deals td {
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
          vertical-align: top;
        }
        .clients-deal-cell-date { max-width: 8.5rem; }
        .clients-deal-cell-pos { white-space: normal; word-break: break-word; }
        .clients-deals th { font-weight: 600; white-space: nowrap; }
        .clients-deals tr:last-child td { border-bottom: none; }
        .clients-pdf { padding: 4px 8px; font-size: 0.8rem; }
        .clients-deal-cards {
          list-style: none;
          margin: 0;
          padding: 0;
          display: none;
          flex-direction: column;
          gap: 12px;
        }
        .clients-deal-item {
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          border-radius: 12px;
          padding: 12px 14px;
          background: var(--input-bg, rgba(0,0,0,0.15));
        }
        .clients-deal-item-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.86rem;
          line-height: 1.4;
          padding: 4px 0;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
        }
        .clients-deal-item-row:last-of-type { border-bottom: none; }
        .clients-deal-item-v { text-align: right; min-width: 0; max-width: 64%; word-break: break-word; }
        .clients-deal-item-pos { text-align: right; }
        .clients-deal-item-foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 10px;
          padding-top: 2px;
        }
        @media (max-width: 640px) {
          .clients-deals--table { display: none; }
          .clients-deal-cards { display: flex; }
        }
        @media (min-width: 641px) {
          .clients-deal-cards { display: none !important; }
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
