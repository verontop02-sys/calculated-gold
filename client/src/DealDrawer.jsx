import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api.js';

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parsePrice(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function rowFromDeal(r) {
  return {
    itemName: String(r?.itemName || ''),
    metal: String(r?.metal || 'Золото'),
    probe: String(r?.probe || ''),
    weightGross: String(r?.weightGross ?? ''),
    weightNet: String(r?.weightNet ?? ''),
    priceRub: r?.priceRub != null && r.priceRub !== '' ? String(r.priceRub) : '',
    photoUrl: r?.photoUrl || '',
  };
}

function emptyEditRow() {
  return {
    itemName: '',
    metal: 'Золото',
    probe: '',
    weightGross: '',
    weightNet: '',
    priceRub: '',
    photoUrl: '',
  };
}

/**
 * Дравер деталей сделки. Открывается по preview (минимум id), подгружает полные данные.
 * Режим «Исправить» — правка на месте; PDF при следующем скачивании уже с новыми данными.
 */
export function DealDrawer({ deal, onClose, formatMoney, toast, onUpdated, canEdit = false }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!deal?.id) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    setEditing(false);
    setForm(null);
    setEditErr('');
    api
      .scrapDealDetail(deal.id)
      .then((r) => { if (alive) setDetail(r.deal); })
      .catch(() => { /* покажем preview без доп. полей */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [deal?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (photo) setPhoto(null);
      else if (editing) {
        setEditing(false);
        setEditErr('');
      } else onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, photo, editing]);

  const editTotal = useMemo(() => {
    if (!form?.rows) return 0;
    return form.rows.reduce((s, r) => s + parsePrice(r.priceRub), 0);
  }, [form]);

  if (!deal) return null;

  const d = detail || deal;
  const mount = typeof document !== 'undefined' ? document.body : null;
  const rows = Array.isArray(d.rows) ? d.rows.filter((r) => r.itemName || r.weightGross || r.priceRub || r.photoUrl) : [];

  function startEdit() {
    const src = detail || deal;
    const rawRows = Array.isArray(src.rows) ? src.rows : [];
    const mapped = rawRows.map(rowFromDeal).filter((r) => r.itemName || r.weightGross || r.priceRub || r.photoUrl);
    setForm({
      sellerName: String(src.seller_name || ''),
      phone: String(src.phone || ''),
      contractNo: String(src.contract_no || ''),
      appraiserName: String(src.appraiser_name || ''),
      source: src.source === 'delivery' ? 'delivery' : 'office',
      rows: mapped.length ? mapped : [emptyEditRow()],
    });
    setEditErr('');
    setEditing(true);
  }

  function patchRow(i, patch) {
    setForm((prev) => ({
      ...prev,
      rows: prev.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));
  }

  async function saveEdit(e) {
    e?.preventDefault?.();
    if (!deal?.id || !form) return;
    setEditErr('');
    const cleanRows = form.rows
      .map((r) => ({
        itemName: String(r.itemName || '').trim(),
        metal: String(r.metal || 'Золото').trim() || 'Золото',
        probe: String(r.probe || '').trim(),
        weightGross: String(r.weightGross || '').trim(),
        weightNet: String(r.weightNet || '').trim(),
        priceRub: parsePrice(r.priceRub),
        photoUrl: r.photoUrl || undefined,
      }))
      .filter((r) => r.itemName || r.weightGross || r.weightNet || r.priceRub);
    if (!cleanRows.length) {
      setEditErr('Добавьте хотя бы одну позицию');
      return;
    }
    const totalRub = cleanRows.reduce((s, r) => s + r.priceRub, 0);
    setSaving(true);
    try {
      const out = await api.updateScrapDeal(deal.id, {
        sellerName: form.sellerName,
        phone: form.phone,
        contractNo: form.contractNo,
        appraiserName: form.appraiserName,
        source: form.source === 'delivery' ? 'delivery' : 'office',
        rows: cleanRows,
        totalRub,
      });
      const next = out?.deal || null;
      if (next) setDetail(next);
      setEditing(false);
      setForm(null);
      toast?.('Сделка исправлена', 'success');
      onUpdated?.(next || { ...d, ...{ total_rub: totalRub, rows: cleanRows } });
    } catch (err) {
      setEditErr(err?.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const blob = await api.scrapDealPdf(deal.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dogovor-${d.contract_no || String(deal.id).slice(0, 8)}.pdf`;
      a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast?.(e?.message || 'Не удалось скачать PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  if (!mount) return null;

  return createPortal(
    <div className="ddw-overlay" onClick={editing ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Детали сделки">
      <div className="ddw" onClick={(e) => e.stopPropagation()}>
        <div className="ddw-head">
          <div className="ddw-head__main">
            <span className="ddw-avatar">{(d.seller_name || '?').trim().slice(0, 1).toUpperCase()}</span>
            <div>
              <div className="ddw-seller">{editing ? 'Исправление сделки' : (d.seller_name || 'Без имени')}</div>
              <div className="ddw-meta">
                {d.contract_no ? `Договор № ${d.contract_no}` : 'Договор'} · {fmtDateTime(d.created_at)}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="ddw-close"
            onClick={() => (editing ? (setEditing(false), setEditErr('')) : onClose?.())}
            aria-label="Закрыть"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {!editing && (
          <div className="ddw-total">
            <span className="ddw-total__label">Сумма к выдаче</span>
            <span className="ddw-total__value mono-nums">{formatMoney(Number(d.total_rub) || 0)}</span>
          </div>
        )}

        {loading && <div className="ddw-loading">Загружаем детали…</div>}

        {editing && form ? (
          <form className="ddw-edit" onSubmit={saveEdit}>
            <label className="ddw-field">
              <span>ФИО продавца</span>
              <input value={form.sellerName} onChange={(e) => setForm((p) => ({ ...p, sellerName: e.target.value }))} disabled={saving} />
            </label>
            <div className="ddw-edit-row">
              <label className="ddw-field">
                <span>Телефон</span>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} disabled={saving} />
              </label>
              <label className="ddw-field">
                <span>№ договора</span>
                <input value={form.contractNo} onChange={(e) => setForm((p) => ({ ...p, contractNo: e.target.value }))} disabled={saving} />
              </label>
            </div>
            <label className="ddw-field">
              <span>Оценщик</span>
              <input value={form.appraiserName} onChange={(e) => setForm((p) => ({ ...p, appraiserName: e.target.value }))} disabled={saving} />
            </label>
            <fieldset className="ddw-field" style={{ border: 0, margin: 0, padding: 0 }}>
              <span>Канал</span>
              <div className="ddw-source" role="radiogroup" aria-label="Канал сделки">
                <button
                  type="button"
                  className={`ddw-source-btn${form.source === 'office' ? ' ddw-source-btn--on' : ''}`}
                  disabled={saving}
                  onClick={() => setForm((p) => ({ ...p, source: 'office' }))}
                >
                  Отделение
                </button>
                <button
                  type="button"
                  className={`ddw-source-btn${form.source === 'delivery' ? ' ddw-source-btn--on' : ''}`}
                  disabled={saving}
                  onClick={() => setForm((p) => ({ ...p, source: 'delivery' }))}
                >
                  Курьер
                </button>
              </div>
            </fieldset>

            <div className="ddw-section-title">Позиции</div>
            {form.rows.map((r, i) => (
              <div key={i} className="ddw-edit-pos">
                <label className="ddw-field">
                  <span>Изделие</span>
                  <input value={r.itemName} onChange={(e) => patchRow(i, { itemName: e.target.value })} disabled={saving} />
                </label>
                <div className="ddw-edit-row">
                  <label className="ddw-field">
                    <span>Проба</span>
                    <input value={r.probe} onChange={(e) => patchRow(i, { probe: e.target.value })} disabled={saving} />
                  </label>
                  <label className="ddw-field">
                    <span>Вес лом, г</span>
                    <input value={r.weightGross} onChange={(e) => patchRow(i, { weightGross: e.target.value })} disabled={saving} />
                  </label>
                  <label className="ddw-field">
                    <span>Чист., г</span>
                    <input value={r.weightNet} onChange={(e) => patchRow(i, { weightNet: e.target.value })} disabled={saving} />
                  </label>
                  <label className="ddw-field">
                    <span>Сумма, ₽</span>
                    <input inputMode="decimal" value={r.priceRub} onChange={(e) => patchRow(i, { priceRub: e.target.value })} disabled={saving} />
                  </label>
                </div>
                {form.rows.length > 1 && (
                  <button type="button" className="ddw-link" disabled={saving} onClick={() => setForm((p) => ({ ...p, rows: p.rows.filter((_, j) => j !== i) }))}>
                    Убрать позицию
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="ddw-link" disabled={saving} onClick={() => setForm((p) => ({ ...p, rows: [...p.rows, emptyEditRow()] }))}>
              + Позиция
            </button>

            <div className="ddw-total ddw-total--edit">
              <span className="ddw-total__label">Итого к выдаче</span>
              <span className="ddw-total__value mono-nums">{formatMoney(editTotal)}</span>
            </div>

            {editErr && <p className="ddw-err">{editErr}</p>}
            <div className="ddw-edit-actions">
              <button type="submit" className="ddw-pdf ddw-pdf--primary" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Сохранить исправления'}
              </button>
              <button type="button" className="ddw-pdf" disabled={saving} onClick={() => { setEditing(false); setEditErr(''); }}>
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="ddw-info">
              {d.phone && <div className="ddw-info__row"><span className="ddw-info__k">Телефон</span><a className="ddw-info__v ddw-info__v--link" href={`tel:${d.phone}`}>{d.phone}</a></div>}
              {detail?.passport_line && <div className="ddw-info__row"><span className="ddw-info__k">Паспорт</span><span className="ddw-info__v">{detail.passport_line}</span></div>}
              {detail?.address && <div className="ddw-info__row"><span className="ddw-info__k">Адрес</span><span className="ddw-info__v">{detail.address}</span></div>}
              {d.appraiser_name && <div className="ddw-info__row"><span className="ddw-info__k">Оценщик</span><span className="ddw-info__v">{d.appraiser_name}</span></div>}
              <div className="ddw-info__row">
                <span className="ddw-info__k">Канал</span>
                <span className="ddw-info__v">{d.source === 'delivery' ? 'Курьер' : 'Отделение'}</span>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="ddw-positions">
                <div className="ddw-section-title">Позиции</div>
                {rows.map((r, i) => (
                  <div key={i} className="ddw-pos">
                    {r.photoUrl && (
                      <button type="button" className="ddw-pos__photo" onClick={() => setPhoto({ url: r.photoUrl, name: r.itemName || 'Изделие' })}>
                        <img src={r.photoUrl} alt={r.itemName || 'Изделие'} />
                      </button>
                    )}
                    <div className="ddw-pos__body">
                      <div className="ddw-pos__name">{r.itemName || 'Позиция'}</div>
                      <div className="ddw-pos__props">
                        {r.metal && <span>{r.metal}</span>}
                        {r.probe && <span>{r.probe} пр.</span>}
                        {r.weightGross && <span>{r.weightGross} г лом</span>}
                        {r.weightNet && <span>{r.weightNet} г чист.</span>}
                      </div>
                    </div>
                    {r.priceRub != null && Number(r.priceRub) > 0 && (
                      <div className="ddw-pos__price mono-nums">{formatMoney(Number(r.priceRub) || 0)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="ddw-edit-actions">
              {canEdit && (
                <button type="button" className="ddw-pdf ddw-pdf--primary" onClick={startEdit} disabled={loading}>
                  Исправить
                </button>
              )}
              <button type="button" className="ddw-pdf" onClick={downloadPdf} disabled={pdfBusy}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
                {pdfBusy ? 'Формируем PDF…' : 'Скачать договор (PDF)'}
              </button>
            </div>
          </>
        )}
      </div>

      {photo && (
        <div className="ddw-photo-overlay" onClick={() => setPhoto(null)}>
          <div className="ddw-photo-modal" onClick={(e) => e.stopPropagation()}>
            <img src={photo.url} alt={photo.name} className="ddw-photo-full" />
            <div className="ddw-photo-caption">{photo.name}</div>
            <button type="button" className="ddw-photo-close" onClick={() => setPhoto(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ddw-overlay {
          position: fixed; inset: 0; z-index: 96;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(8px);
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0;
          animation: ddwFade 240ms ease both;
        }
        @media (min-width: 600px) { .ddw-overlay { align-items: center; padding: 24px; } }
        @keyframes ddwFade { from { opacity: 0; } }
        .ddw {
          width: 100%; max-width: 520px; max-height: 92dvh;
          overflow-y: auto; overflow-x: hidden;
          background: var(--bg-panel-solid); border: 1px solid var(--stroke-soft);
          border-radius: 22px 22px 0 0;
          padding: 24px 20px 28px;
          display: flex; flex-direction: column; gap: 16px;
          box-shadow: 0 -16px 60px rgba(0,0,0,0.3);
          animation: ddwUp 380ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @media (min-width: 600px) { .ddw { border-radius: 22px; box-shadow: var(--shadow-pop); animation: ddwIn 360ms cubic-bezier(0.22,1,0.36,1) both; } }
        @keyframes ddwUp { from { transform: translateY(100%); opacity: 0; } }
        @keyframes ddwIn { from { transform: translateY(18px) scale(0.97); opacity: 0; } }

        .ddw-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .ddw-head__main { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .ddw-avatar { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; background: var(--accent-soft); color: var(--text-strong); font-size: 1.1rem; font-weight: 700; font-family: var(--font-display); display: flex; align-items: center; justify-content: center; }
        .ddw-seller { font-size: 1.05rem; font-weight: 700; color: var(--text-strong); word-break: break-word; }
        .ddw-meta { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
        .ddw-close { flex-shrink: 0; border: 1px solid var(--stroke-soft); background: var(--bg-elevated); color: var(--text-muted); border-radius: 10px; padding: 6px; cursor: pointer; display: flex; transition: all 160ms; }
        .ddw-close:hover { background: var(--crimson-soft); color: var(--crimson); border-color: var(--crimson); }

        .ddw-total { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(120deg, var(--emerald), color-mix(in srgb, var(--emerald) 75%, #000)); border-radius: 16px; padding: 16px 18px; color: #fff; }
        .ddw-total--edit { margin-top: 4px; }
        .ddw-total__label { font-size: 0.8rem; font-weight: 600; opacity: 0.9; }
        .ddw-total__value { font-size: 1.4rem; font-weight: 800; letter-spacing: -0.03em; font-family: var(--font-display); }

        .ddw-loading { font-size: 0.85rem; color: var(--text-muted); }
        .ddw-info { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--stroke-soft); border-radius: 14px; padding: 6px 14px; background: var(--bg-elevated); }
        .ddw-info__row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--stroke-soft); }
        .ddw-info__row:last-child { border: none; }
        .ddw-info__k { font-size: 0.8rem; color: var(--text-muted); flex-shrink: 0; }
        .ddw-info__v { font-size: 0.84rem; font-weight: 600; text-align: right; word-break: break-word; }
        .ddw-info__v--link { color: var(--accent); text-decoration: none; }

        .ddw-section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
        .ddw-positions { display: flex; flex-direction: column; gap: 8px; }
        .ddw-pos { display: flex; align-items: flex-start; gap: 12px; border: 1px solid var(--stroke-soft); border-radius: 14px; padding: 12px 14px; background: var(--bg-elevated); }
        .ddw-pos__photo { width: 56px; height: 56px; border-radius: 10px; overflow: hidden; flex-shrink: 0; border: 1px solid var(--stroke-soft); padding: 0; cursor: pointer; background: var(--bg-panel-solid); transition: transform 180ms; }
        .ddw-pos__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ddw-pos__photo:hover { transform: scale(1.05); }
        .ddw-pos__body { flex: 1; min-width: 0; }
        .ddw-pos__name { font-size: 0.88rem; font-weight: 600; margin-bottom: 4px; }
        .ddw-pos__props { display: flex; flex-wrap: wrap; gap: 4px 8px; }
        .ddw-pos__props span { font-size: 0.72rem; background: var(--surface); border: 1px solid var(--stroke-soft); border-radius: 6px; padding: 2px 7px; color: var(--text-muted); }
        .ddw-pos__price { font-size: 0.9rem; font-weight: 700; color: var(--accent); flex-shrink: 0; align-self: center; font-family: var(--font-display); }

        .ddw-pdf { display: flex; align-items: center; gap: 8px; justify-content: center; width: 100%; padding: 14px; border-radius: 14px; border: 1.5px solid var(--stroke-soft); background: var(--bg-elevated); color: var(--text); font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 180ms; }
        .ddw-pdf:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .ddw-pdf:disabled { opacity: 0.5; }
        .ddw-pdf--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
        .ddw-pdf--primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 88%, #000); color: #fff; border-color: transparent; }

        .ddw-edit { display: flex; flex-direction: column; gap: 12px; }
        .ddw-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
        .ddw-field span { font-size: 0.72rem; font-weight: 600; color: var(--text-muted); }
        .ddw-field input {
          padding: 9px 11px; border-radius: 10px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); color: var(--text); font: inherit; font-size: 0.88rem;
        }
        .ddw-field input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .ddw-edit-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        @media (min-width: 520px) { .ddw-edit-row { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .ddw-edit-pos { border: 1px solid var(--stroke-soft); border-radius: 14px; padding: 12px; background: var(--bg-elevated); display: flex; flex-direction: column; gap: 8px; }
        .ddw-link { border: none; background: transparent; color: var(--accent); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; align-self: flex-start; }
        .ddw-link:disabled { opacity: 0.5; }
        .ddw-source { display: flex; gap: 8px; margin-top: 4px; }
        .ddw-source-btn {
          flex: 1; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); color: var(--text-muted); font-size: 0.84rem; font-weight: 600; cursor: pointer;
        }
        .ddw-source-btn--on { background: var(--accent); border-color: var(--accent); color: #fff; }
        .ddw-err { margin: 0; color: var(--crimson); font-size: 0.84rem; font-weight: 600; }
        .ddw-edit-actions { display: flex; flex-direction: column; gap: 8px; }

        .ddw-photo-overlay { position: fixed; inset: 0; z-index: 101; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: ddwFade 200ms ease both; }
        .ddw-photo-modal { position: relative; max-width: 600px; width: 100%; background: var(--bg-panel-solid); border-radius: 20px; border: 1px solid var(--stroke-soft); overflow: hidden; }
        .ddw-photo-full { width: 100%; max-height: 72vh; object-fit: contain; display: block; }
        .ddw-photo-caption { padding: 14px 16px; font-size: 0.88rem; color: var(--text-muted); }
        .ddw-photo-close { position: absolute; top: 12px; right: 12px; border: none; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); color: #fff; border-radius: 10px; padding: 8px; cursor: pointer; display: flex; }
        .ddw-photo-close:hover { background: var(--crimson); }

        @media (max-width: 480px) { .ddw { max-width: 100%; } }
      `}</style>
    </div>,
    mount
  );
}
