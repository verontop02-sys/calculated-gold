import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { isSuperAdminRole, roleLabel } from './roles.js';
import { SkeletonRow, SkeletonCard } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHint } from './PageHint.jsx';
import { DealDrawer } from './DealDrawer.jsx';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dealRowPhotos(d) {
  if (!Array.isArray(d.rows)) return [];
  return d.rows.filter((r) => r?.photoUrl).map((r) => ({ url: r.photoUrl, name: r.itemName || 'Изделие' }));
}

export function EmployeeDeals({ formatMoney, toast, user }) {
  const [staff, setStaff] = useState([]);
  const [staffBusy, setStaffBusy] = useState(true);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);
  const [dealsBusy, setDealsBusy] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [photoModal, setPhotoModal] = useState(null);
  const [openDeal, setOpenDeal] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .users()
      .then((rows) => { if (alive) setStaff(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (alive) { setStaff([]); toast?.(e?.message || 'Нет списка сотрудников', 'error'); } })
      .finally(() => { if (alive) setStaffBusy(false); });
    return () => { alive = false; };
  }, [toast]);

  const loadDeals = useCallback(async (uid) => {
    setDealsBusy(true);
    setData(null);
    try {
      const d = await api.operatorDeals(uid, 300);
      setData(d);
    } catch (e) {
      setData({ deals: [], stats: { dealsCount: 0, totalRub: 0, totalGross: 0, totalNet: 0 } });
      toast?.(e?.message || 'Не удалось загрузить сделки', 'error');
    } finally {
      setDealsBusy(false);
    }
  }, [toast]);

  const select = useCallback((u) => {
    setSelected(u);
    loadDeals(u.uid);
  }, [loadDeals]);

  async function onPdf(d) {
    if (!d?.id) return;
    setPdfBusyId(d.id);
    try {
      const blob = await api.scrapDealPdf(d.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dogovor-${d.contract_no || String(d.id).slice(0, 8)}.pdf`;
      a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast?.(e?.message || 'Не удалось скачать PDF', 'error');
    } finally {
      setPdfBusyId(null);
    }
  }

  const stats = data?.stats;
  const deals = data?.deals || [];
  const allPhotos = useMemo(() => {
    const out = [];
    for (const d of deals) out.push(...dealRowPhotos(d));
    return out;
  }, [deals]);

  return (
    <div className="ed-root">
      <PageHint id="employees" title="Сделки сотрудников">
        Выберите сотрудника слева — справа появятся все его сделки с суммами, фотографиями изделий и кнопкой скачать договор. Удобно для контроля и разбора.
      </PageHint>

      <div className="ed-layout">
        {/* Список сотрудников */}
        <div className="ed-panel ed-panel--list">
          <div className="ed-panel-label">Сотрудники</div>
          <div className="ed-staff">
            {staffBusy && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} leftWidth="60%" rightWidth="30%" withAvatar />)}
            {!staffBusy && staff.length === 0 && (
              <EmptyState compact icon="users" title="Нет сотрудников" description="Добавьте пользователей в разделе «Настройки»." />
            )}
            {staff.map((u, idx) => {
              const active = selected?.uid === u.uid;
              return (
                <button key={u.uid} type="button"
                  className={`ed-staff__row${active ? ' ed-staff__row--active' : ''}`}
                  style={{ '--i': idx }}
                  onClick={() => select(u)}
                >
                  <span className="ed-staff__avatar" aria-hidden>{(u.email || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="ed-staff__body">
                    <span className="ed-staff__email">{u.email}</span>
                    <span className="ed-staff__role">{roleLabel(u.role)}</span>
                  </span>
                  {active && <svg className="ed-staff__check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Детали */}
        <div className="ed-panel ed-panel--detail">
          {!selected ? (
            <EmptyState icon="users" title="Выберите сотрудника" description="Здесь появятся его сделки, фото изделий и документы." />
          ) : (
            <div className="ed-detail">
              <div className="ed-head">
                <div className="ed-head__avatar" aria-hidden>{(selected.email || '?').slice(0, 1).toUpperCase()}</div>
                <div className="ed-head__info">
                  <div className="ed-head__email">{selected.email}</div>
                  <span className="ed-head__role">{roleLabel(selected.role)}</span>
                </div>
              </div>

              {/* Статистика */}
              {dealsBusy ? (
                <div className="ed-stats">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="ed-skel" />)}
                </div>
              ) : (
                <div className="ed-stats">
                  <div className="ed-stat ed-stat--accent">
                    <span className="ed-stat__label">Оборот</span>
                    <span className="ed-stat__value mono-nums">{formatMoney(stats?.totalRub || 0)}</span>
                  </div>
                  <div className="ed-stat">
                    <span className="ed-stat__label">Сделок</span>
                    <span className="ed-stat__value mono-nums">{stats?.dealsCount || 0}</span>
                  </div>
                  <div className="ed-stat">
                    <span className="ed-stat__label">Золото, г</span>
                    <span className="ed-stat__value ed-stat__value--sm mono-nums">{(stats?.totalGross || 0).toFixed(2)} / {(stats?.totalNet || 0).toFixed(3)}</span>
                  </div>
                </div>
              )}

              {/* Фото всех изделий */}
              {!dealsBusy && allPhotos.length > 0 && (
                <div className="ed-photos">
                  <div className="ed-section-title">Фото изделий ({allPhotos.length})</div>
                  <div className="ed-photos-strip">
                    {allPhotos.map((p, i) => (
                      <button key={i} type="button" className="ed-photo" title={p.name} onClick={() => setPhotoModal(p)}>
                        <img src={p.url} alt={p.name} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Список сделок */}
              <div className="ed-section-title">Сделки</div>
              {dealsBusy && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SkeletonCard rows={2} showTitle={false} />
                  <SkeletonCard rows={2} showTitle={false} />
                </div>
              )}
              {!dealsBusy && deals.length === 0 && (
                <EmptyState compact icon="deals" title="Сделок нет" description="У этого сотрудника пока нет оформленных договоров." />
              )}
              {!dealsBusy && deals.length > 0 && (
                <div className="ed-deals">
                  {deals.map((d) => {
                    const photos = dealRowPhotos(d);
                    return (
                      <div key={d.id} className="ed-deal ed-deal--clickable" onClick={() => setOpenDeal(d)} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenDeal(d); } }}>
                        <div className="ed-deal__top">
                          <div className="ed-deal__meta">
                            <span className="ed-deal__name">{d.seller_name || 'Без имени'}</span>
                            <span className="ed-deal__sub">
                              {d.contract_no ? `№ ${d.contract_no}` : 'Договор'} · {fmtDateTime(d.created_at)}
                              {d.first_probe ? ` · ${d.first_probe} пр.` : ''}
                            </span>
                          </div>
                          <div className="ed-deal__right">
                            <span className="ed-deal__sum mono-nums">{formatMoney(Number(d.total_rub) || 0)}</span>
                            <button type="button" className="ed-deal__pdf" onClick={(e) => { e.stopPropagation(); onPdf(d); }} disabled={pdfBusyId === d.id}>
                              {pdfBusyId === d.id ? '…' : (
                                <>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
                                  PDF
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        {photos.length > 0 && (
                          <div className="ed-deal__photos">
                            {photos.map((p, i) => (
                              <button key={i} type="button" className="ed-deal__photo" title={p.name} onClick={(e) => { e.stopPropagation(); setPhotoModal(p); }}>
                                <img src={p.url} alt={p.name} />
                              </button>
                            ))}
                          </div>
                        )}
                        <span className="ed-deal__chevron" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {openDeal && (
        <DealDrawer
          deal={openDeal}
          onClose={() => setOpenDeal(null)}
          formatMoney={formatMoney}
          toast={toast}
          canEdit={isSuperAdminRole(user?.role)}
          onUpdated={(next) => {
            if (!next?.id) return;
            setData((prev) => {
              if (!prev?.deals) return prev;
              const deals = prev.deals.map((x) => (x.id === next.id ? { ...x, ...next } : x));
              const totalRub = deals.reduce((s, x) => s + (Number(x.total_rub) || 0), 0);
              return {
                ...prev,
                deals,
                stats: { ...(prev.stats || {}), dealsCount: deals.length, totalRub },
              };
            });
            setOpenDeal((prev) => (prev?.id === next.id ? { ...prev, ...next } : prev));
          }}
        />
      )}

      {photoModal && (
        <div className="ed-photo-overlay" onClick={() => setPhotoModal(null)}>
          <div className="ed-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img src={photoModal.url} alt={photoModal.name} className="ed-photo-full" />
            <div className="ed-photo-caption">{photoModal.name}</div>
            <button type="button" className="ed-photo-close" onClick={() => setPhotoModal(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ed-root { display: flex; flex-direction: column; gap: 16px; animation: edIn 440ms cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes edIn { from { opacity: 0; transform: translate3d(0,14px,0); } }
        .ed-layout { display: grid; grid-template-columns: 280px 1fr; gap: 14px; align-items: start; }
        @media (max-width: 800px) { .ed-layout { grid-template-columns: 1fr; } }
        .ed-panel { background: var(--bg-panel-solid); border: 1px solid var(--stroke-soft); border-radius: 18px; padding: 16px; min-width: 0; }
        .ed-panel-label { font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }

        .ed-staff { display: flex; flex-direction: column; gap: 3px; max-height: min(62vh, 560px); overflow-y: auto; }
        .ed-staff__row {
          display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px;
          border: 1px solid transparent; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit;
          transition: background 160ms, border-color 160ms, transform 160ms;
          animation: edIn 360ms cubic-bezier(0.22,1,0.36,1) both; animation-delay: calc(var(--i,0) * 28ms);
        }
        .ed-staff__row:hover { background: var(--surface); border-color: var(--stroke-soft); transform: translateX(2px); }
        .ed-staff__row--active { background: var(--accent-soft); border-color: var(--accent); }
        .ed-staff__avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: var(--accent-soft); color: var(--text-strong); font-size: 0.8rem; font-weight: 700; font-family: var(--font-display); display: flex; align-items: center; justify-content: center; }
        .ed-staff__row--active .ed-staff__avatar { background: var(--accent); color: #fff; }
        .ed-staff__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .ed-staff__email { font-size: 0.84rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ed-staff__role { font-size: 0.7rem; color: var(--text-muted); }
        .ed-staff__check { color: var(--accent); flex-shrink: 0; }

        .ed-detail { display: flex; flex-direction: column; gap: 16px; }
        .ed-head { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px; background: var(--bg-elevated); border: 1px solid var(--stroke-soft); }
        .ed-head__avatar { width: 48px; height: 48px; border-radius: 50%; flex-shrink: 0; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #000)); color: #fff; font-size: 1.2rem; font-weight: 800; font-family: var(--font-display); display: flex; align-items: center; justify-content: center; }
        .ed-head__email { font-size: 0.98rem; font-weight: 700; word-break: break-all; }
        .ed-head__role { font-size: 0.74rem; color: var(--accent); font-weight: 600; }

        .ed-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 520px) { .ed-stats { grid-template-columns: 1fr; } }
        .ed-stat { padding: 14px; border-radius: 14px; border: 1px solid var(--stroke-soft); background: var(--bg-elevated); display: flex; flex-direction: column; gap: 4px; }
        .ed-stat--accent { background: linear-gradient(145deg, var(--accent-soft), var(--bg-elevated) 70%); border-color: color-mix(in srgb, var(--accent) 28%, transparent); }
        .ed-stat__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 600; }
        .ed-stat__value { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; font-family: var(--font-display); color: var(--text-strong); }
        .ed-stat--accent .ed-stat__value { color: var(--accent); }
        .ed-stat__value--sm { font-size: 0.92rem; }

        .ed-section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); }
        .ed-photos { display: flex; flex-direction: column; gap: 8px; }
        .ed-photos-strip { display: flex; gap: 8px; flex-wrap: wrap; }
        .ed-photo { width: 72px; height: 72px; border-radius: 12px; overflow: hidden; border: 1px solid var(--stroke-soft); background: var(--bg-elevated); cursor: pointer; padding: 0; transition: transform 200ms, box-shadow 200ms; }
        .ed-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ed-photo:hover { transform: scale(1.05); box-shadow: var(--shadow-pop); }

        .ed-deals { display: flex; flex-direction: column; gap: 10px; }
        .ed-deal { position: relative; padding: 14px; border-radius: 14px; border: 1px solid var(--stroke-soft); background: var(--bg-elevated); display: flex; flex-direction: column; gap: 10px; transition: box-shadow 200ms, transform 200ms, border-color 200ms; animation: edIn 320ms cubic-bezier(0.22,1,0.36,1) both; }
        .ed-deal:hover { box-shadow: var(--shadow-pop); }
        .ed-deal--clickable { cursor: pointer; padding-right: 30px; }
        .ed-deal--clickable:hover { transform: translateX(2px); border-color: var(--accent); }
        .ed-deal__chevron { position: absolute; right: 12px; top: 16px; color: var(--text-dim); transition: transform 180ms, color 180ms; }
        .ed-deal--clickable:hover .ed-deal__chevron { color: var(--accent); transform: translateX(2px); }
        .ed-deal__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ed-deal__meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .ed-deal__name { font-size: 0.9rem; font-weight: 600; }
        .ed-deal__sub { font-size: 0.74rem; color: var(--text-muted); }
        .ed-deal__right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .ed-deal__sum { font-size: 1rem; font-weight: 800; color: var(--accent); font-family: var(--font-display); }
        .ed-deal__pdf { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 9px; border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid); color: var(--text-muted); font-size: 0.76rem; font-weight: 600; cursor: pointer; transition: all 160ms; }
        .ed-deal__pdf:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .ed-deal__pdf:disabled { opacity: 0.45; }
        .ed-deal__photos { display: flex; gap: 6px; flex-wrap: wrap; }
        .ed-deal__photo { width: 52px; height: 52px; border-radius: 10px; overflow: hidden; border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid); cursor: pointer; padding: 0; transition: transform 180ms; }
        .ed-deal__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ed-deal__photo:hover { transform: scale(1.08); }

        .ed-skel { height: 70px; border-radius: 14px; background: var(--surface); animation: edPulse 1.4s ease infinite; }
        @keyframes edPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

        .ed-photo-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: edIn 200ms ease both; }
        .ed-photo-modal { position: relative; max-width: 600px; width: 100%; background: var(--bg-panel-solid); border-radius: 20px; border: 1px solid var(--stroke-soft); overflow: hidden; }
        .ed-photo-full { width: 100%; max-height: 70vh; object-fit: contain; display: block; }
        .ed-photo-caption { padding: 14px 16px; font-size: 0.88rem; color: var(--text-muted); }
        .ed-photo-close { position: absolute; top: 12px; right: 12px; border: none; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); color: #fff; border-radius: 10px; padding: 8px; cursor: pointer; display: flex; transition: background 160ms; }
        .ed-photo-close:hover { background: var(--crimson); }
      `}</style>
    </div>
  );
}
