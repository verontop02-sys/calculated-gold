import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const PAGE = 100;

function formatDealsDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function emptyEdit() {
  return { full_name: '', phone: '', passport_line: '', address: '' };
}

export function ScrapCustomerDirectory({ open, onClose, formatMoney, onPick, onCustomerDeleted, toast }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dealsById, setDealsById] = useState({});
  const [openHistoryId, setOpenHistoryId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(emptyEdit);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(
    async (fromOffset) => {
      if (!open) return;
      setBusy(true);
      try {
        const o = fromOffset != null ? fromOffset : 0;
        const { customers, total: t } = await api.scrapCustomersList({
          q: q.trim() || undefined,
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
        setBusy(false);
      }
    },
    [open, q, toast]
  );

  useEffect(() => {
    if (!open) return;
    setOffset(0);
    setList([]);
    const wait = String(q).trim() ? 280 : 0;
    const t = setTimeout(() => {
      load(0);
    }, wait);
    return () => clearTimeout(t);
  }, [open, q, load]);

  useEffect(() => {
    if (open) {
      setOpenHistoryId(null);
      setDealsById({});
      setDetailId(null);
      setEditingId(null);
      setEdit(emptyEdit());
    }
  }, [open]);

  async function loadDeals(c) {
    const id = c.id;
    if (!id) return;
    setDealsById((prev) => ({ ...prev, [id]: { ...prev[id], loading: true, err: null } }));
    try {
      const { deals, total: tc } = await api.scrapDeals({ customerId: id, limit: 200, offset: 0 });
      setDealsById((prev) => ({
        ...prev,
        [id]: { deals: deals || [], total: tc ?? 0, loading: false, err: null },
      }));
    } catch (e) {
      setDealsById((prev) => ({
        ...prev,
        [id]: { deals: [], total: 0, loading: false, err: e?.message || 'Ошибка' },
      }));
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEdit({
      full_name: c.full_name || '',
      phone: c.phone || '',
      passport_line: c.passport_line || '',
      address: c.address || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit(emptyEdit());
  }

  async function saveEdit() {
    const id = editingId;
    if (!id) return;
    const full_name = edit.full_name.trim();
    if (!full_name) {
      toast?.('Укажите ФИО', 'error');
      return;
    }
    setSaveBusy(true);
    try {
      const { customer } = await api.saveScrapCustomer({
        id,
        full_name,
        phone: edit.phone.trim() || null,
        passport_line: edit.passport_line.trim() || null,
        address: edit.address.trim() || null,
      });
      setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...customer } : r)));
      setEditingId(null);
      setEdit(emptyEdit());
      toast?.('Сохранено', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaveBusy(false);
    }
  }

  async function remove(c) {
    if (
      !window.confirm(
        `Удалить карточку «${c.full_name || 'клиент'}» из базы? История сделок останется, но от привязки к карточке снимется.`
      )
    ) {
      return;
    }
    setDeletingId(c.id);
    try {
      await api.deleteScrapCustomer(c.id);
      setList((prev) => prev.filter((x) => x.id !== c.id));
      setTotal((n) => Math.max(0, n - 1));
      onCustomerDeleted?.(c.id);
      if (detailId === c.id) {
        setDetailId(null);
        setOpenHistoryId(null);
        setDealsById((prev) => {
          const next = { ...prev };
          delete next[c.id];
          return next;
        });
      }
      if (editingId === c.id) cancelEdit();
      toast?.('Карточка удалена', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось удалить', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const canLoadMore = list.length < total;

  if (!open) return null;

  return (
    <div className="sc-dir-overlay" role="dialog" aria-modal="true" aria-label="База клиентов" onClick={onClose}>
      <div className="sc-dir-panel glass" onClick={(e) => e.stopPropagation()}>
        <div className="sc-dir-head">
          <h3 className="sc-dir-title">База клиентов (договоры)</h3>
          <button type="button" className="sc-dir-x" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted small sc-dir-hint">Всего: {total}. Сделки появляются после «Скачать PDF».</p>
        <div className="sc-dir-search">
          <input
            className="sc-dir-input"
            placeholder="Поиск по ФИО или телефону…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          {busy && <span className="muted small sc-dir-busy">…</span>}
        </div>
        <div className="sc-dir-list">
          {list.length === 0 && !busy && <p className="muted sc-dir-empty">Нет записей</p>}
          {list.map((c) => {
            const hist = dealsById[c.id];
            const showHist = openHistoryId === c.id;
            const showDetail = detailId === c.id;
            const isEdit = editingId === c.id;
            return (
              <div key={c.id} className="sc-dir-item">
                <div className="sc-dir-row">
                  <div className="sc-dir-info">
                    <div className="sc-dir-name">{c.full_name || '—'}</div>
                    <div className="sc-dir-meta muted small">
                      {c.phone || '—'}
                      {c.updated_at && <span> · {new Date(c.updated_at).toLocaleDateString('ru-RU')}</span>}
                    </div>
                  </div>
                  <div className="sc-dir-actions">
                    <button type="button" className="btn-row-tool" onClick={() => setDetailId(showDetail ? null : c.id)} title="Все поля">
                      {showDetail ? '▲' : '▼'} Карточка
                    </button>
                    <button
                      type="button"
                      className="btn-row-tool"
                      onClick={() => {
                        onPick?.(c);
                        onClose();
                        toast?.('Клиент подставлен', 'success');
                      }}
                    >
                      В форму
                    </button>
                    <button
                      type="button"
                      className="btn-row-tool"
                      onClick={async () => {
                        if (showHist) {
                          setOpenHistoryId(null);
                        } else {
                          setOpenHistoryId(c.id);
                          if (!dealsById[c.id]) await loadDeals(c);
                        }
                      }}
                    >
                      {showHist ? 'Скрыть сделки' : 'Сделки'}
                    </button>
                    {!isEdit && (
                      <button type="button" className="btn-row-tool" onClick={() => startEdit(c)}>
                        Изм.
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-row-tool sc-dir-btn-del"
                      disabled={deletingId != null}
                      onClick={() => remove(c)}
                    >
                      {deletingId === c.id ? '…' : 'Уд.'}
                    </button>
                  </div>
                </div>
                {showDetail && !isEdit && (
                  <div className="sc-dir-detail">
                    {c.created_at && (
                      <p className="sc-dir-dl muted small">
                        Создано: {new Date(c.created_at).toLocaleString('ru-RU')}
                      </p>
                    )}
                    <p className="sc-dir-dl">
                      <strong>Паспорт</strong> {c.passport_line || '—'}
                    </p>
                    <p className="sc-dir-dl sc-dir-addr">
                      <strong>Адрес</strong> {c.address || '—'}
                    </p>
                  </div>
                )}
                {isEdit && (
                  <div className="sc-dir-edit">
                    <label className="sc-dir-field">
                      <span>ФИО *</span>
                      <input value={edit.full_name} onChange={(e) => setEdit((o) => ({ ...o, full_name: e.target.value }))} />
                    </label>
                    <label className="sc-dir-field">
                      <span>Телефон</span>
                      <input value={edit.phone} onChange={(e) => setEdit((o) => ({ ...o, phone: e.target.value }))} inputMode="tel" />
                    </label>
                    <label className="sc-dir-field">
                      <span>Паспорт</span>
                      <input value={edit.passport_line} onChange={(e) => setEdit((o) => ({ ...o, passport_line: e.target.value }))} />
                    </label>
                    <label className="sc-dir-field">
                      <span>Адрес</span>
                      <textarea
                        className="sc-dir-ta"
                        rows={3}
                        value={edit.address}
                        onChange={(e) => setEdit((o) => ({ ...o, address: e.target.value }))}
                      />
                    </label>
                    <div className="sc-dir-edit-btns">
                      <button type="button" className="btn-secondary" onClick={cancelEdit} disabled={saveBusy}>
                        Отмена
                      </button>
                      <button type="button" className="btn-primary sc-dir-save" onClick={saveEdit} disabled={saveBusy}>
                        {saveBusy ? '…' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                )}
                {showHist && !isEdit && (
                  <div className="sc-dir-hist">
                    {hist?.loading && <p className="muted small">Загрузка сделок…</p>}
                    {hist?.err && <p className="err-text small">{hist.err}</p>}
                    {hist && !hist.loading && !hist.err && (hist.deals || []).length === 0 && (
                      <p className="muted small">Сделок пока нет.</p>
                    )}
                    {hist &&
                      !hist.loading &&
                      (hist.deals || []).map((d) => (
                        <div key={d.id} className="sc-dir-deal">
                          <span className="mono-nums sc-dir-deal-d">{formatDealsDate(d.created_at)}</span>
                          <span className="sc-dir-deal-s">{formatMoney(d.total_rub)}</span>
                          <span className="mono-nums sc-dir-deal-p">{d.first_probe != null ? `${d.first_probe} пр` : '—'}</span>
                          {d.contract_no && <span className="sc-dir-deal-no">дог. №{d.contract_no}</span>}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
          {canLoadMore && !busy && list.length > 0 && (
            <div className="sc-dir-more">
              <button type="button" className="btn-ghost" onClick={() => load(list.length)}>
                Показать ещё ({list.length} / {total})
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .sc-dir-overlay {
          position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.5);
          display: flex; align-items: flex-end; justify-content: center; padding: 12px;
        }
        @media (min-width: 600px) {
          .sc-dir-overlay { align-items: center; padding: 20px; }
        }
        .sc-dir-panel {
          width: 100%; max-width: 720px; max-height: 90dvh; display: flex; flex-direction: column;
          border-radius: 14px; overflow: hidden;
        }
        .sc-dir-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--stroke); }
        .sc-dir-title { margin: 0; font-size: 1.05rem; font-weight: 600; }
        .sc-dir-x { width: 36px; height: 36px; border: none; background: transparent; font-size: 1.4rem; line-height: 1; color: var(--text-muted); cursor: pointer; border-radius: 8px; }
        .sc-dir-x:hover { color: var(--text); background: var(--stroke); }
        .sc-dir-hint { margin: 0; padding: 0 16px 10px; }
        .sc-dir-search { padding: 0 16px 10px; position: relative; }
        .sc-dir-input { width: 100%; }
        .sc-dir-busy { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .sc-dir-list { overflow: auto; flex: 1; min-height: 0; padding: 0 10px 16px; }
        .sc-dir-empty { padding: 20px; text-align: center; }
        .sc-dir-more { padding: 8px; text-align: center; }
        .sc-dir-item { border: 1px solid var(--stroke); border-radius: 10px; margin-bottom: 8px; background: var(--input-bg); }
        .sc-dir-row { display: flex; gap: 6px; align-items: flex-start; justify-content: space-between; padding: 10px 12px; }
        @media (max-width: 520px) { .sc-dir-row { flex-direction: column; } }
        .sc-dir-info { min-width: 0; flex: 1; }
        .sc-dir-name { font-weight: 600; font-size: 0.9rem; }
        .sc-dir-meta { margin-top: 2px; }
        .sc-dir-actions { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
        .sc-dir-btn-del { color: #f87171; border-color: rgba(248,113,113,0.35) !important; }
        .sc-dir-btn-del:hover { color: #ef4444 !important; }
        .sc-dir-detail { padding: 0 12px 12px; font-size: 0.8rem; line-height: 1.45; border-top: 1px solid var(--stroke); }
        .sc-dir-dl { margin: 8px 0 0; word-break: break-word; }
        .sc-dir-addr { font-size: 0.76rem; color: var(--text-muted); }
        .sc-dir-edit { padding: 12px; border-top: 1px solid var(--stroke); display: flex; flex-direction: column; gap: 8px; }
        .sc-dir-field { display: flex; flex-direction: column; gap: 3px; font-size: 0.72rem; }
        .sc-dir-field span { text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
        .sc-dir-field input, .sc-dir-ta { font-size: 0.9rem; }
        .sc-dir-ta { resize: vertical; font-family: inherit; line-height: 1.4; min-height: 64px; }
        .sc-dir-edit-btns { display: flex; gap: 8px; margin-top: 4px; }
        .sc-dir-save { flex: 1; border-radius: 10px; }
        .sc-dir-hist { padding: 0 12px 12px; border-top: 1px solid var(--stroke); }
        .sc-dir-deal { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; font-size: 0.8rem; padding: 6px 0; border-bottom: 1px solid var(--stroke); }
        .sc-dir-deal:last-child { border-bottom: none; }
        .err-text { color: var(--danger); }
        .sc-dir-deal-s { color: var(--gold); font-weight: 600; }
        .sc-dir-deal-no { grid-column: 1 / -1; font-size: 0.72rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
