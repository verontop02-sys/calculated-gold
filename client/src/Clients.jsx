import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { SkeletonRow, SkeletonCard } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHint } from './PageHint.jsx';

const PAGE = 80;

const SORT_OPTIONS = [
  { id: 'alpha',   label: 'А–Я' },
  { id: 'newest',  label: 'Новые' },
  { id: 'volume',  label: 'Оборот' },
];

function dealDateCompact(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortProbeWeight(d) {
  const p = d?.first_probe != null ? d.first_probe : null;
  const w = d?.first_weight_gross != null || d?.first_weight_net != null;
  const parts = [];
  if (p != null) parts.push(`${p} пр.`);
  if (w) {
    const a = d.first_weight_gross != null ? `${d.first_weight_gross}` : '';
    const b = d.first_weight_net != null ? `${d.first_weight_net}` : '';
    if (a || b) parts.push(a && b ? `${a} / ${b} г` : `${a || b} г`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Фотографии всех позиций из массива сделок */
function collectDealPhotos(deals) {
  const photos = [];
  for (const d of deals || []) {
    if (!Array.isArray(d.rows)) continue;
    for (const r of d.rows) {
      if (r?.photoUrl) photos.push({ url: r.photoUrl, name: r.itemName || 'Изделие' });
    }
  }
  return photos;
}

export function Clients({ formatMoney, toast }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [deals, setDeals] = useState(null);
  const [dealsBusy, setDealsBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [deletingDealId, setDeletingDealId] = useState(null);
  const [photoModal, setPhotoModal] = useState(null); // { url, name }

  const loadList = useCallback(
    async (fromOffset, sortOverride) => {
      setListBusy(true);
      try {
        const o = fromOffset != null ? fromOffset : 0;
        const s = sortOverride ?? sort;
        const { customers, total: t } = await api.scrapCustomersList({
          q: String(q).trim() || undefined,
          limit: PAGE,
          offset: o,
          sort: s === 'volume' ? 'alpha' : s,
        });
        const data = customers || [];
        if (o === 0) setList(data);
        else setList((prev) => [...prev, ...data]);
        setOffset(o + data.length);
        setTotal(typeof t === 'number' ? t : o + data.length);
      } catch (e) {
        toast?.(e?.message || 'Ошибка загрузки', 'error');
      } finally {
        setListBusy(false);
      }
    },
    [q, sort, toast]
  );

  useEffect(() => {
    setOffset(0);
    setList([]);
    setSelected(null);
    setDeals(null);
    const wait = String(q).trim() ? 280 : 0;
    const t = setTimeout(() => loadList(0), wait);
    return () => clearTimeout(t);
  }, [q, sort, loadList]);

  // Сортировка «Оборот» — клиентская, по сумме сделок (не требует aggregate на сервере)
  const sortedList = useMemo(() => {
    if (sort !== 'volume') return list;
    return [...list].sort((a, b) => {
      const sumA = a._totalRub ?? 0;
      const sumB = b._totalRub ?? 0;
      return sumB - sumA;
    });
  }, [list, sort]);

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

  // Транслируем выбор клиента наружу для боковой панели
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cg:clients-selection', { detail: { customer: selected, deals, total } })
    );
  }, [selected, deals, total]);

  async function onDownloadPdf(d) {
    if (!d?.id) return;
    setPdfBusyId(d.id);
    try {
      const blob = await api.scrapDealPdf(d.id);
      downloadBlob(blob, `dogovor-${String(d.id).slice(0, 8)}.pdf`);
      toast?.('PDF скачан', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось скачать PDF', 'error');
    } finally {
      setPdfBusyId(null);
    }
  }

  async function onDeleteDeal(d) {
    if (!d?.id) return;
    if (!window.confirm('Удалить эту запись о сделке из учёта? Восстановить нельзя.')) return;
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

  const photos = useMemo(() => collectDealPhotos(deals), [deals]);

  return (
    <div className="cl-root">
      <PageHint id="clients" title="База клиентов">
        Клиенты добавляются автоматически при скачивании PDF договора. Ищите по ФИО или телефону, сортируйте по новизне, обороту или алфавиту. В карточке — история сделок и <b>фото изделий</b> (клик по фото открывает крупно).
      </PageHint>
      {/* ── Поиск + сортировки ── */}
      <div className="cl-toolbar">
        <div className="cl-search-wrap">
          <svg className="cl-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
          <input
            className="cl-search"
            placeholder="Телефон или ФИО…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          {q && (
            <button type="button" className="cl-search-clear" onClick={() => setQ('')} aria-label="Очистить">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
        <div className="cl-sort-pills" role="group" aria-label="Сортировка">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`cl-sort-pill${sort === o.id ? ' cl-sort-pill--active' : ''}`}
              onClick={() => setSort(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-layout">
        {/* ── Список ── */}
        <div className="cl-panel cl-panel--list">
          <div className="cl-panel-label">
            Клиентов: <strong>{total}</strong>
          </div>
          <div className="cl-list">
            {listBusy && list.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} leftWidth="65%" rightWidth="38%" withAvatar />)}
              </div>
            )}
            {sortedList.length === 0 && !listBusy && (
              <EmptyState compact icon={q ? 'search' : 'clients'}
                title={q ? 'Никого не нашли' : 'Клиентов пока нет'}
                description={q ? 'Попробуйте другой запрос или часть номера телефона.' : 'Клиенты появляются автоматически при скачивании PDF в разделе «Договор».'}
              />
            )}
            {sortedList.map((c, idx) => {
              const active = selected?.id === c.id;
              return (
                <button key={c.id} type="button"
                  className={`cl-row${active ? ' cl-row--active' : ''}`}
                  style={{ '--i': idx }}
                  onClick={() => select(c)}
                >
                  <span className="cl-row-avatar" aria-hidden>
                    {(c.full_name || '?').trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="cl-row-body">
                    <span className="cl-row-name">{c.full_name || '—'}</span>
                    <span className="cl-row-phone">{c.phone || '—'}</span>
                  </span>
                  {active && (
                    <svg className="cl-row-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
              );
            })}
          </div>
          {canLoadMore && (
            <button type="button" className="cl-more" onClick={() => loadList(offset)} disabled={listBusy}>
              {listBusy ? '…' : `Показать ещё`}
            </button>
          )}
        </div>

        {/* ── Карточка клиента ── */}
        <div className="cl-panel cl-panel--detail">
          {!selected ? (
            <EmptyState icon="users" title="Выберите клиента"
              description="Здесь появится карточка с контактами, историей сделок и фотографиями изделий."
            />
          ) : (
            <div className="cl-detail">
              {/* Шапка клиента */}
              <div className="cl-client-card">
                <div className="cl-client-avatar" aria-hidden>
                  {(selected.full_name || '?').trim().slice(0, 1).toUpperCase()}
                </div>
                <div className="cl-client-info">
                  <h3 className="cl-client-name">{selected.full_name || '—'}</h3>
                  {selected.phone && (
                    <a href={`tel:${selected.phone}`} className="cl-client-phone">{selected.phone}</a>
                  )}
                </div>
              </div>

              {(selected.passport_line || selected.address) && (
                <div className="cl-client-meta">
                  {selected.passport_line && (
                    <div className="cl-meta-row">
                      <span className="cl-meta-k">Паспорт</span>
                      <span className="cl-meta-v">{selected.passport_line}</span>
                    </div>
                  )}
                  {selected.address && (
                    <div className="cl-meta-row">
                      <span className="cl-meta-k">Адрес</span>
                      <span className="cl-meta-v">{selected.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Фото изделий */}
              {photos.length > 0 && (
                <div className="cl-photos">
                  <div className="cl-photos-title">Фото изделий</div>
                  <div className="cl-photos-strip">
                    {photos.map((p, i) => (
                      <button key={i} type="button" className="cl-photo-thumb" title={p.name}
                        onClick={() => setPhotoModal(p)}>
                        <img src={p.url} alt={p.name} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Сделки */}
              <div className="cl-deals-head">
                <span className="cl-deals-title">Сделки</span>
                {deals && deals.length > 0 && (
                  <span className="cl-deals-count">{deals.length}</span>
                )}
              </div>

              {dealsBusy && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SkeletonCard rows={2} showTitle={false} />
                  <SkeletonCard rows={2} showTitle={false} />
                </div>
              )}

              {!dealsBusy && (!deals || deals.length === 0) && (
                <EmptyState compact icon="deals" title="Сделок пока нет"
                  description="Сделка появится здесь, когда вы скачаете PDF договора с этим клиентом."
                />
              )}

              {deals && deals.length > 0 && (
                <div className="cl-deal-list">
                  {deals.map((d) => {
                    const rowPhotos = Array.isArray(d.rows)
                      ? d.rows.filter((r) => r?.photoUrl).map((r) => ({ url: r.photoUrl, name: r.itemName || 'Изделие' }))
                      : [];
                    return (
                      <div key={d.id} className="cl-deal">
                        <div className="cl-deal-top">
                          <div className="cl-deal-meta">
                            <span className="cl-deal-date">{dealDateCompact(d.created_at)}</span>
                            {d.contract_no && <span className="cl-deal-no">№ {d.contract_no}</span>}
                          </div>
                          <div className="cl-deal-actions">
                            <button type="button" className="cl-deal-btn" onClick={() => onDownloadPdf(d)} disabled={pdfBusyId === d.id}>
                              {pdfBusyId === d.id ? '…' : (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
                                  PDF
                                </>
                              )}
                            </button>
                            <button type="button" className="cl-deal-btn cl-deal-btn--del" onClick={() => onDeleteDeal(d)} disabled={deletingDealId === d.id} title="Удалить сделку">
                              {deletingDealId === d.id ? '…' : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="cl-deal-bottom">
                          <span className="cl-deal-sum mono-nums">{d.total_rub != null ? formatMoney(d.total_rub) : '—'}</span>
                          {shortProbeWeight(d) && <span className="cl-deal-probe">{shortProbeWeight(d)}</span>}
                        </div>
                        {rowPhotos.length > 0 && (
                          <div className="cl-deal-photos">
                            {rowPhotos.map((p, i) => (
                              <button key={i} type="button" className="cl-deal-photo" title={p.name} onClick={() => setPhotoModal(p)}>
                                <img src={p.url} alt={p.name} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Модалка фото ── */}
      {photoModal && (
        <div className="cl-photo-overlay" onClick={() => setPhotoModal(null)}>
          <div className="cl-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img src={photoModal.url} alt={photoModal.name} className="cl-photo-full" />
            <div className="cl-photo-caption">{photoModal.name}</div>
            <button type="button" className="cl-photo-close" onClick={() => setPhotoModal(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* ── Clients root ── */
        .cl-root { display: flex; flex-direction: column; gap: 16px; animation: clIn 440ms cubic-bezier(0.22,1,0.36,1) both; will-change: transform, opacity; }
        @keyframes clIn { from { opacity:0; transform: translate3d(0,14px,0); } }

        /* ── Toolbar ── */
        .cl-toolbar {
          display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
        }
        .cl-search-wrap {
          flex: 1 1 200px; position: relative; display: flex; align-items: center;
        }
        .cl-search-icon {
          position: absolute; left: 12px; color: var(--text-muted); pointer-events: none; flex-shrink: 0;
        }
        .cl-search {
          width: 100%; padding: 10px 36px 10px 38px;
          border-radius: 12px; border: 1px solid var(--stroke-soft);
          background: var(--bg-panel-solid); color: var(--text);
          font-size: 0.9rem; font-family: inherit;
          transition: border-color 200ms, box-shadow 200ms;
        }
        .cl-search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .cl-search-clear {
          position: absolute; right: 10px; border: none; background: transparent;
          color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 6px; display: flex;
          transition: color 160ms;
        }
        .cl-search-clear:hover { color: var(--text); }

        .cl-sort-pills { display: flex; gap: 6px; flex-shrink: 0; }
        .cl-sort-pill {
          padding: 8px 16px; border-radius: 10px; border: 1px solid var(--stroke-soft);
          background: var(--bg-panel-solid); color: var(--text-muted);
          font-size: 0.82rem; font-weight: 600; cursor: pointer;
          transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .cl-sort-pill:hover { border-color: var(--accent); color: var(--accent); }
        .cl-sort-pill--active {
          background: var(--accent); border-color: var(--accent); color: #fff;
          box-shadow: 0 2px 12px var(--accent-glow, rgba(99,70,255,0.35));
        }
        @media (max-width: 540px) { .cl-sort-pills { display: none; } }

        /* ── Layout ── */
        .cl-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 800px) { .cl-layout { grid-template-columns: 1fr; } }

        /* ── Panel ── */
        .cl-panel {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 18px;
          padding: 16px;
        }
        .cl-panel-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
        .cl-panel-label strong { color: var(--text); font-weight: 700; }

        /* ── List ── */
        .cl-list {
          display: flex; flex-direction: column; gap: 2px;
          max-height: min(58vh, 520px); overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: var(--stroke-soft) transparent;
        }
        .cl-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: 12px;
          border: 1px solid transparent; background: transparent;
          color: inherit; cursor: pointer; text-align: left; font: inherit;
          transition: background 160ms, border-color 160ms, transform 160ms;
          animation: clIn 400ms cubic-bezier(0.22,1,0.36,1) both;
          animation-delay: calc(var(--i, 0) * 30ms);
        }
        .cl-row:hover { background: var(--surface); border-color: var(--stroke-soft); transform: translateX(2px); }
        .cl-row--active { background: var(--accent-soft); border-color: var(--accent); }
        .cl-row-avatar {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          background: var(--accent-soft); color: var(--accent);
          font-size: 0.8rem; font-weight: 700; font-family: var(--font-display);
          display: flex; align-items: center; justify-content: center;
        }
        .cl-row--active .cl-row-avatar { background: var(--accent); color: #fff; }
        .cl-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .cl-row-name { font-size: 0.86rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cl-row-phone { font-size: 0.72rem; color: var(--text-muted); }
        .cl-row-check { color: var(--accent); flex-shrink: 0; }
        .cl-more {
          width: 100%; margin-top: 10px; padding: 10px; border-radius: 10px;
          border: 1.5px dashed var(--stroke-soft); background: transparent;
          color: var(--text-muted); font-size: 0.82rem; font-weight: 600; cursor: pointer;
          transition: all 180ms;
        }
        .cl-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

        /* ── Detail ── */
        .cl-detail { display: flex; flex-direction: column; gap: 14px; }

        .cl-client-card {
          display: flex; align-items: center; gap: 14px;
          padding: 16px; border-radius: 16px;
          background: var(--bg-elevated); border: 1px solid var(--stroke-soft);
        }
        .cl-client-avatar {
          width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #000));
          color: #fff; font-size: 1.3rem; font-weight: 800; font-family: var(--font-display);
          display: flex; align-items: center; justify-content: center;
        }
        .cl-client-info { flex: 1; min-width: 0; }
        .cl-client-name { margin: 0 0 4px; font-size: 1.05rem; font-weight: 700; font-family: var(--font-display); }
        .cl-client-phone { font-size: 0.85rem; color: var(--accent); text-decoration: none; }
        .cl-client-phone:hover { text-decoration: underline; }

        .cl-client-meta {
          display: flex; flex-direction: column; gap: 8px;
          padding: 12px 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
        }
        .cl-meta-row { display: flex; gap: 12px; font-size: 0.82rem; }
        .cl-meta-k { color: var(--text-muted); flex-shrink: 0; width: 68px; }
        .cl-meta-v { color: var(--text); word-break: break-word; }

        /* ── Photos ── */
        .cl-photos { display: flex; flex-direction: column; gap: 8px; }
        .cl-photos-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); }
        .cl-photos-strip { display: flex; gap: 8px; flex-wrap: wrap; }
        .cl-photo-thumb {
          width: 72px; height: 72px; border-radius: 12px; overflow: hidden;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          cursor: pointer; padding: 0; transition: transform 200ms, box-shadow 200ms;
        }
        .cl-photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cl-photo-thumb:hover { transform: scale(1.05); box-shadow: var(--shadow-pop); }

        /* ── Deals ── */
        .cl-deals-head { display: flex; align-items: center; gap: 8px; }
        .cl-deals-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); }
        .cl-deals-count {
          background: var(--accent-soft); color: var(--accent);
          font-size: 0.72rem; font-weight: 700; border-radius: 999px;
          padding: 2px 8px;
        }
        .cl-deal-list { display: flex; flex-direction: column; gap: 10px; max-height: min(56vh, 540px); overflow-y: auto; }
        .cl-deal {
          padding: 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          display: flex; flex-direction: column; gap: 8px;
          transition: box-shadow 200ms;
          animation: clIn 360ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .cl-deal:hover { box-shadow: var(--shadow-pop); }
        .cl-deal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .cl-deal-meta { display: flex; flex-direction: column; gap: 2px; }
        .cl-deal-date { font-size: 0.78rem; color: var(--text-muted); }
        .cl-deal-no { font-size: 0.78rem; color: var(--text-muted); }
        .cl-deal-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .cl-deal-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 9px;
          border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid);
          color: var(--text-muted); font-size: 0.78rem; font-weight: 600; cursor: pointer;
          transition: all 160ms;
        }
        .cl-deal-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .cl-deal-btn--del:hover:not(:disabled) { border-color: var(--crimson); color: var(--crimson); background: var(--crimson-soft); }
        .cl-deal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cl-deal-bottom { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .cl-deal-sum { font-size: 1.05rem; font-weight: 800; color: var(--accent); font-family: var(--font-display); letter-spacing: -0.02em; }
        .cl-deal-probe { font-size: 0.75rem; color: var(--text-muted); }
        .cl-deal-photos { display: flex; gap: 6px; flex-wrap: wrap; }
        .cl-deal-photo {
          width: 52px; height: 52px; border-radius: 10px; overflow: hidden;
          border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid);
          cursor: pointer; padding: 0; transition: transform 180ms;
        }
        .cl-deal-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .cl-deal-photo:hover { transform: scale(1.08); }

        /* ── Photo modal ── */
        .cl-photo-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
          animation: clIn 200ms ease both;
        }
        .cl-photo-modal {
          position: relative; max-width: 600px; width: 100%;
          background: var(--bg-panel-solid); border-radius: 20px;
          border: 1px solid var(--stroke-soft); overflow: hidden;
          animation: clIn 300ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .cl-photo-full { width: 100%; max-height: 70vh; object-fit: contain; display: block; }
        .cl-photo-caption { padding: 14px 16px; font-size: 0.88rem; color: var(--text-muted); }
        .cl-photo-close {
          position: absolute; top: 12px; right: 12px;
          border: none; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
          color: #fff; border-radius: 10px; padding: 8px; cursor: pointer; display: flex;
          transition: background 160ms;
        }
        .cl-photo-close:hover { background: var(--crimson); }
      `}</style>
    </div>
  );
}
