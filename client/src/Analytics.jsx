import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  LineChart,
} from 'recharts';
import { api } from './api.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toIso(d) {
  if (!d) return '';
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return t.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, m) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}

function weekLabel(key) {
  if (!key) return '';
  const [y, mo, d] = String(key).split('-');
  if (!d) return key;
  return `${d}.${mo}`;
}

function monthLabel(key) {
  if (!key || String(key).length < 7) return key;
  const [y, m] = String(key).split('-');
  return `${m}.${y}`;
}

function numish(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatProbeWeightGrossNet(x) {
  if (!x) return '— / —';
  const g = numish(x.weightGrossSum);
  const n = numish(x.weightNetSum);
  return `${g != null ? g.toFixed(2) : '—'} / ${n != null ? n.toFixed(3) : '—'}`;
}

export function Analytics({ formatMoney, toast }) {
  const today = toIso(new Date());
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => addDays(today, -30));
  const [group, setGroup] = useState('day');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  /** Какие блоки попасть в PDF (тот же период дат и агрегация «дни/недели/месяцы» сверху). */
  const [pdfSec, setPdfSec] = useState({
    summary: true,
    operators: true,
    probe: true,
    series: true,
  });

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const d = await api.analyticsSummary(from, to);
      setData(d);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function applyPreset(preset) {
    const t = toIso(new Date());
    if (preset === '7d') {
      setTo(t);
      setFrom(addDays(t, -7));
    } else if (preset === '30d') {
      setTo(t);
      setFrom(addDays(t, -30));
    } else if (preset === '90d') {
      setTo(t);
      setFrom(addDays(t, -90));
    } else if (preset === 'ytd') {
      const y = new Date();
      setTo(t);
      setFrom(`${y.getFullYear()}-01-01`);
    } else if (preset === 'month') {
      setTo(t);
      setFrom(addMonths(t, -1));
    }
  }

  const t = data?.totals;
  const byProbe = useMemo(
    () =>
      (data?.byProbe || []).map((x) => ({
        ...x,
        weightGrossSum: x.weightGrossSum ?? x.weight_gross_sum,
        weightNetSum: x.weightNetSum ?? x.weight_net_sum,
        label: `${x.probe} пр.`,
      })),
    [data]
  );

  function setPdfCheck(id, on) {
    setPdfSec((prev) => {
      const next = { ...prev, [id]: on };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  }

  async function exportPdf() {
    const keys = Object.entries(pdfSec)
      .filter(([, on]) => on)
      .map(([k]) => k);
    if (keys.length === 0) {
      toast?.('Отметьте хотя бы один раздел в PDF', 'error');
      return;
    }
    setPdfBusy(true);
    try {
      const blob = await api.analyticsSummaryPdf(from, to, group, keys);
      const pf = String(from || '').replace(/[^\d-]/g, '') || 'from';
      const pt = String(to || '').replace(/[^\d-]/g, '') || 'to';
      downloadBlob(blob, `analitika-${pf}_${pt}.pdf`);
      toast?.('PDF скачан', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось сформировать PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  const { moneySeries, weightLabelKey } = useMemo(() => {
    const d = data;
    if (!d) {
      return { moneySeries: [], weightLabelKey: 'day' };
    }
    if (group === 'day') {
      return {
        moneySeries: (d.byDay || []).map((x) => ({
          ...x,
          x: x.day?.slice(5) || x.day,
        })),
        weightLabelKey: 'day',
      };
    }
    if (group === 'week') {
      return {
        moneySeries: (d.byWeek || []).map((x) => ({
          sumRub: x.sumRub,
          weightGross: x.weightGross,
          weightNet: x.weightNet,
          count: x.count,
          x: weekLabel(x.key),
        })),
        weightLabelKey: 'week',
      };
    }
    return {
      moneySeries: (d.byMonth || []).map((x) => ({
        sumRub: x.sumRub,
        weightGross: x.weightGross,
        weightNet: x.weightNet,
        count: x.count,
        x: monthLabel(x.key),
      })),
      weightLabelKey: 'month',
    };
  }, [data, group]);

  return (
    <div className="analytics-page">
      <div className="glass analytics-hero">
        <h2 className="analytics-title">Аналитика</h2>
        <p className="muted analytics-lead">
          Учёт только сделок, по которым ушёл PDF из раздела «Договор» (тот, кто скачал, пишется в сделку как
          сотрудник). Графики по пробе и весу берут первую из трёх строк на договоре.
        </p>
        <div className="analytics-presets">
          <span className="muted small">Период:</span>
          <button type="button" className="an-pill" onClick={() => applyPreset('7d')}>
            7 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('30d')}>
            30 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('90d')}>
            90 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('ytd')}>
            С 1 янв.
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('month')}>
            1 мес назад
          </button>
        </div>
        <div className="analytics-filters">
          <label className="field field-inline">
            <span className="field-label">С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field field-inline">
            <span className="field-label">По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="an-group-btns" role="group" aria-label="Агрегация графиков">
            {[
              { id: 'day', t: 'Дни' },
              { id: 'week', t: 'Недели' },
              { id: 'month', t: 'Месяцы' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                className={`an-group-btn${group === b.id ? ' active' : ''}`}
                onClick={() => setGroup(b.id)}
              >
                {b.t}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? '…' : 'Обновить'}
          </button>
        </div>
        <div className="glass an-pdf-row" role="group" aria-label="Состав PDF-отчёта">
          <div className="an-pdf-row-top">
            <span className="an-pdf-title">PDF-отчёт</span>
            <p className="an-pdf-hint muted small">
              Период и агрегация (дни/недели/месяцы) — как в фильтрах. В PDF: титул, графики (деньги, вес, пробы) и
              сводные таблицы, как в полном «дашборде».
            </p>
          </div>
          <div className="an-pdf-controls">
            {[
              { id: 'summary', label: 'Сводка (KPI)' },
              { id: 'operators', label: 'Сотрудники' },
              { id: 'probe', label: 'Сделок по пробе' },
              { id: 'series', label: 'Динамика (сумма и вес)' },
            ].map((x) => (
              <label key={x.id} className="an-pdf-cb">
                <input
                  type="checkbox"
                  checked={!!pdfSec[x.id]}
                  onChange={(e) => setPdfCheck(x.id, e.target.checked)}
                />
                {x.label}
              </label>
            ))}
            <div className="an-pdf-actions">
              <button
                type="button"
                className="btn-ghost small"
                onClick={() =>
                  setPdfSec({ summary: true, operators: true, probe: true, series: true })
                }
              >
                Всё
              </button>
              <button
                type="button"
                className="btn-secondary an-pdf-download"
                onClick={exportPdf}
                disabled={loading || pdfBusy}
                title="Скачать PDF с выбранными разделами"
              >
                {pdfBusy ? '…' : 'Скачать PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {err && <div className="glass analytics-err">{err}</div>}

      {t && !loading && (
        <div className="analytics-kpi-grid">
          <div className="glass analytics-kpi">
            <span className="analytics-kpi-label">Сделок</span>
            <span className="analytics-kpi-value mono-nums">{t.deals}</span>
          </div>
          <div className="glass analytics-kpi">
            <span className="analytics-kpi-label">Сумма, ₽</span>
            <span className="analytics-kpi-value mono-nums">{formatMoney(t.sumRub)}</span>
          </div>
          <div className="glass analytics-kpi">
            <span className="analytics-kpi-label">Клиентов (уник.)</span>
            <span className="analytics-kpi-value mono-nums">{t.uniqueCustomers}</span>
          </div>
          <div className="glass analytics-kpi">
            <span className="analytics-kpi-label">Вес 1-й строки, г</span>
            <span className="analytics-kpi-value mono-nums small-digits">
              {t.firstRowWeightGrossSum != null ? t.firstRowWeightGrossSum.toFixed(2) : '—'} /{' '}
              {t.firstRowWeightNetSum != null ? t.firstRowWeightNetSum.toFixed(3) : '—'}
            </span>
            <span className="analytics-kpi-hint muted">лом / чист., сумма за период</span>
          </div>
        </div>
      )}

      {t && !loading && t.deals > 0 && (
        <div className="glass analytics-op-card">
          <h3 className="analytics-h3">Сотрудники</h3>
          <p className="muted small an-h3-sub">В строке — e-mail того, кто скачал PDF по сделке. Без входа: «без учётки».</p>
          {Array.isArray(data?.byOperator) && data.byOperator.length > 0 ? (
            <div className="analytics-op-table-wrap">
              <table className="analytics-op-table">
                <thead>
                  <tr>
                    <th>Учётная запись</th>
                    <th className="mono-nums">Сделок</th>
                    <th className="mono-nums">Сумма, ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byOperator.map((row) => (
                    <tr key={row.operatorId == null ? 'none' : String(row.operatorId)}>
                      <td>{row.email || '—'}</td>
                      <td className="mono-nums">{row.deals}</td>
                      <td className="mono-nums">{formatMoney(row.sumRub)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Таблицу сотрудников сейчас не показать: на сервере ещё старая логика. Выкатите последний бэк и
              фронт, потом снова «Обновить» на этой странице.
            </p>
          )}
        </div>
      )}

      {byProbe.length > 0 && !loading && (
        <div className="glass analytics-chart-card">
          <h3 className="analytics-h3">Сделок по пробе</h3>
          <p className="muted small an-h3-sub">По первой строке таблицы в договоре (лом, до трёх позиций). Сделок, вес, сумма по пробе.</p>
          <div className="analytics-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProbe} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #333)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="an-tt">
                        {p.label}: сделок {p.count} · вес, г: {formatProbeWeightGrossNet(p)}
                        {p.sumRub != null && ` · ${formatMoney(p.sumRub)}`}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" name="Сделок" fill="var(--gold, #b8860b)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="analytics-probe-table-wrap" role="region" aria-label="Сводка по пробам">
            <table className="analytics-probe-tbl">
              <thead>
                <tr>
                  <th>Проба</th>
                  <th className="mono-nums">Сделок</th>
                  <th className="mono-nums">Вес, г (лом / чист.)</th>
                  <th className="mono-nums">Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                {byProbe.map((r) => (
                  <tr key={r.probe}>
                    <td>{r.probe} пр.</td>
                    <td className="mono-nums">{r.count}</td>
                    <td className="mono-nums small-digits">{formatProbeWeightGrossNet(r)}</td>
                    <td className="mono-nums">{r.sumRub != null ? formatMoney(r.sumRub) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {moneySeries.length > 0 && !loading && (
        <div className="glass analytics-chart-card">
          <h3 className="analytics-h3">Денежный поток ({weightLabelKey === 'day' ? 'по дням' : weightLabelKey === 'week' ? 'по неделям' : 'по месяцам'})</h3>
          <div className="analytics-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moneySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #333)" />
                <XAxis dataKey="x" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => (v != null ? formatMoney(v) : '')} />
                <Line
                  type="monotone"
                  dataKey="sumRub"
                  name="₽"
                  stroke="var(--gold, #b8860b)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {moneySeries.length > 0 && !loading && (
        <div className="glass analytics-chart-card">
          <h3 className="analytics-h3">Вес, г — динамика (первая строка договора)</h3>
          <p className="muted small an-h3-sub">Зелёная линия: общий вес, сиреневая: чистая масса, по дням/неделям/месяцам.</p>
          <div className="analytics-chart-h an-chart-tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={moneySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #333)" />
                <XAxis dataKey="x" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="g" tick={{ fontSize: 10 }} allowDecimals />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="an-tt">
                        {p.weightGross != null && `Вес общ.: ${Number(p.weightGross).toFixed(2)} г `}
                        {p.weightNet != null && `· чист.: ${Number(p.weightNet).toFixed(3)} г`}
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId="g"
                  type="monotone"
                  dataKey="weightGross"
                  name="Общий, г"
                  stroke="#6ee7b7"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="g"
                  type="monotone"
                  dataKey="weightNet"
                  name="Чист., г"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && t?.deals === 0 && !err && (
        <p className="muted analytics-empty">
          За период нет сделок. Скачайте PDF в «Договоре» — сделка тогда запишется и попадёт сюда.
        </p>
      )}

      {loading && (
        <div className="glass analytics-load">
          <div className="spinner" />
          <span className="muted">Считаем…</span>
        </div>
      )}

      <style>{`
        .analytics-page { display: flex; flex-direction: column; gap: 14px; min-width: 0; max-width: 100%; overflow-x: hidden; }
        .analytics-hero { padding: 20px 18px; }
        .analytics-title { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; margin: 0 0 6px; }
        .analytics-lead { margin: 0 0 10px; font-size: 0.86rem; line-height: 1.45; max-width: 44rem; }
        .analytics-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
        .an-pill { border: 1px solid var(--stroke); background: var(--input-bg); color: var(--text); font-size: 0.75rem; padding: 5px 10px; border-radius: 999px; cursor: pointer; font-weight: 600; }
        .an-pill:hover { border-color: var(--gold); color: var(--gold); }
        .analytics-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
        .field.field-inline { display: flex; flex-direction: column; gap: 4px; }
        .field.field-inline .field-label { font-size: 0.7rem; }
        .field.field-inline input { min-width: 9rem; }
        .an-group-btns { display: flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--stroke); }
        .an-group-btn { border: none; background: transparent; color: var(--text-muted); font-size: 0.76rem; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .an-group-btn.active { background: var(--gold-soft); color: var(--gold); }
        .an-pdf-row { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
        .an-pdf-row-top { min-width: 0; }
        .an-pdf-title { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
        .an-pdf-hint { margin: 0; line-height: 1.4; }
        .an-pdf-controls {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
        }
        .an-pdf-cb { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; cursor: pointer; }
        .an-pdf-cb input { width: 16px; height: 16px; accent-color: var(--gold, #b8860b); }
        .an-pdf-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
        .an-pdf-download { font-weight: 600; }
        .analytics-err { padding: 12px 16px; color: var(--danger); font-size: 0.9rem; }
        .analytics-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (min-width: 560px) { .analytics-kpi-grid { grid-template-columns: repeat(4, 1fr); } }
        .analytics-kpi { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
        .analytics-kpi-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .analytics-kpi-value { font-size: 1.1rem; font-weight: 700; color: var(--gold); }
        .small-digits { font-size: 0.95rem; }
        .analytics-kpi-hint { font-size: 0.72rem; }
        .an-h3-sub { margin: 0 0 10px; line-height: 1.4; }
        .analytics-op-card { padding: 16px; min-width: 0; }
        .analytics-op-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; min-width: 0; }
        .analytics-op-table { width: 100%; min-width: 280px; border-collapse: collapse; font-size: 0.86rem; }
        .analytics-op-table th,
        .analytics-op-table td {
          text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--stroke, rgba(255,255,255,0.08));
        }
        .analytics-op-table th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
        .analytics-op-table tr:last-child td { border-bottom: none; }
        .analytics-probe-table-wrap { margin-top: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; min-width: 0; }
        .analytics-probe-tbl { width: 100%; min-width: 320px; border-collapse: collapse; font-size: 0.82rem; }
        .analytics-probe-tbl th,
        .analytics-probe-tbl td { text-align: left; padding: 7px 9px; border-bottom: 1px solid var(--stroke, rgba(255,255,255,0.08)); }
        .analytics-probe-tbl th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
        .analytics-probe-tbl th.mono-nums,
        .analytics-probe-tbl td.mono-nums { text-align: right; }
        .analytics-probe-tbl tr:last-child td { border-bottom: none; }
        .analytics-chart-card { padding: 16px; }
        .analytics-h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 4px; }
        .analytics-chart-h { width: 100%; min-width: 0; height: 220px; }
        .an-chart-tall { height: 240px; }
        .analytics-load { display: flex; align-items: center; gap: 10px; padding: 20px; justify-content: center; }
        .analytics-empty { margin: 0; text-align: center; padding: 8px; font-size: 0.9rem; }
        .an-tt { background: var(--bg-elevated); border: 1px solid var(--stroke); border-radius: 8px; padding: 6px 10px; font-size: 0.8rem; }
      `}</style>
    </div>
  );
}
