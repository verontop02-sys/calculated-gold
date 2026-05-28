import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Area,
  AreaChart,
  Cell,
} from 'recharts';
import { api } from './api.js';
import { SkeletonStats, SkeletonChart, SkeletonTable } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';

// ── helpers ─────────────────────────────────────────────────────────────────
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

function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T12:00:00Z`);
  const b = new Date(`${toIso}T12:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function weekLabel(key) {
  if (!key) return '';
  const [, mo, d] = String(key).split('-');
  if (!d) return key;
  return `${d}.${mo}`;
}

function monthLabel(key) {
  if (!key || String(key).length < 7) return key;
  const [y, m] = String(key).split('-');
  return `${m}.${y}`;
}

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function humanDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function humanDateShort(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]}`;
}

function pluralDays(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b > 1 && b < 5) return 'дня';
  if (b === 1) return 'день';
  return 'дней';
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

/**
 * Считает «дельту» текущего значения к предыдущему периоду.
 * Возвращает объект с относительным процентом, абсолютной разницей и тоном (up/down/flat).
 * up — рост (хорошо), down — падение (плохо). Для метрик где "меньше = лучше" не используем.
 */
function delta(now, prev) {
  const n = numish(now);
  const p = numish(prev);
  if (n == null || p == null) return null;
  if (p === 0 && n === 0) return { pct: 0, abs: 0, tone: 'flat' };
  if (p === 0) return { pct: null, abs: n - p, tone: n > 0 ? 'up' : 'flat' };
  const pct = ((n - p) / Math.abs(p)) * 100;
  const tone = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  return { pct, abs: n - p, tone };
}

function DeltaBadge({ d, suffix = '' }) {
  if (!d) return <span className="an-delta an-delta--flat">—</span>;
  const sign = d.pct == null ? '' : d.pct > 0 ? '+' : d.pct < 0 ? '' : '';
  const txt = d.pct == null
    ? 'нет данных'
    : `${sign}${d.pct.toFixed(d.pct >= 100 || d.pct <= -100 ? 0 : 1)}%${suffix}`;
  const arrow = d.tone === 'up' ? '▲' : d.tone === 'down' ? '▼' : '•';
  return <span className={`an-delta an-delta--${d.tone}`}><span className="an-delta__arrow">{arrow}</span>{txt}</span>;
}

// ── component ────────────────────────────────────────────────────────────────
export function Analytics({ formatMoney, toast }) {
  const today = toIso(new Date());
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => addDays(today, -30));
  const [group, setGroup] = useState('day');
  const [activePreset, setActivePreset] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfSec, setPdfSec] = useState({ summary: true, operators: true, probe: true, series: true });
  const reqIdRef = useRef(0);

  // Параллельно тянем выбранный период и зеркальный период «до него» — для дельт.
  const load = useCallback(async () => {
    const myId = ++reqIdRef.current;
    setErr('');
    setLoading(true);
    try {
      const days = daysBetween(from, to);
      const prevTo = addDays(from, -1);
      const prevFrom = addDays(prevTo, -(days - 1));
      const [cur, prev] = await Promise.all([
        api.analyticsSummary(from, to),
        api.analyticsSummary(prevFrom, prevTo).catch(() => null),
      ]);
      if (myId !== reqIdRef.current) return; // устаревший запрос
      setData(cur);
      setPrevData(prev);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setErr(e?.message || 'Не удалось загрузить');
      setData(null);
      setPrevData(null);
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function applyPreset(preset) {
    const t = toIso(new Date());
    setActivePreset(preset);
    if (preset === 'today') {
      setTo(t);
      setFrom(t);
    } else if (preset === '7d') {
      setTo(t);
      setFrom(addDays(t, -6));
    } else if (preset === '30d') {
      setTo(t);
      setFrom(addDays(t, -29));
    } else if (preset === '90d') {
      setTo(t);
      setFrom(addDays(t, -89));
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
  const tPrev = prevData?.totals;
  const periodDays = daysBetween(from, to);

  // КPI: текущее vs предыдущее
  const kpiCards = useMemo(() => {
    const avg = t && t.deals ? t.sumRub / t.deals : null;
    const avgPrev = tPrev && tPrev.deals ? tPrev.sumRub / tPrev.deals : null;
    return [
      {
        id: 'deals',
        label: 'Сделок',
        value: t?.deals ?? 0,
        render: (v) => new Intl.NumberFormat('ru-RU').format(v),
        d: delta(t?.deals, tPrev?.deals),
        icon: '✦',
      },
      {
        id: 'sum',
        label: 'Оборот, ₽',
        value: t?.sumRub ?? 0,
        render: (v) => formatMoney(v),
        d: delta(t?.sumRub, tPrev?.sumRub),
        icon: '◆',
        hero: true,
      },
      {
        id: 'avg',
        label: 'Средний чек, ₽',
        value: avg,
        render: (v) => (v != null ? formatMoney(Math.round(v)) : '—'),
        d: delta(avg, avgPrev),
        icon: '✱',
      },
      {
        id: 'clients',
        label: 'Уникальных клиентов',
        value: t?.uniqueCustomers ?? 0,
        render: (v) => new Intl.NumberFormat('ru-RU').format(v),
        d: delta(t?.uniqueCustomers, tPrev?.uniqueCustomers),
        icon: '◉',
      },
    ];
  }, [t, tPrev, formatMoney]);

  // спарклайны для KPI берём из byDay
  const sparkData = useMemo(() => {
    const arr = data?.byDay || [];
    return arr.map((x) => ({
      x: x.day,
      sumRub: numish(x.sumRub) ?? 0,
      count: numish(x.count) ?? 0,
    }));
  }, [data]);

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

  const totalDealsByProbe = useMemo(() => byProbe.reduce((s, x) => s + (x.count || 0), 0), [byProbe]);

  // Insights — авто-анализ периода: лучший день, топ-проба, топ-сотрудник, средний чек, последний день.
  const insights = useMemo(() => {
    if (!t || t.deals === 0) return [];
    const out = [];

    const byDay = data?.byDay || [];
    if (byDay.length) {
      let best = null;
      for (const r of byDay) {
        const v = numish(r.sumRub) ?? 0;
        if (!best || v > best.v) best = { day: r.day, v, count: r.count };
      }
      if (best && best.v > 0) {
        out.push({
          k: 'best-day',
          icon: '🏆',
          title: 'Лучший день',
          value: humanDateShort(best.day),
          sub: `${formatMoney(best.v)} · сделок ${best.count}`,
          tone: 'gold',
        });
      }
    }

    if (byProbe.length) {
      const top = [...byProbe].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
      if (top) {
        const pct = totalDealsByProbe ? Math.round((top.count / totalDealsByProbe) * 100) : 0;
        out.push({
          k: 'top-probe',
          icon: '◆',
          title: 'Самая ходовая проба',
          value: `${top.probe} пр.`,
          sub: `сделок ${top.count} · ${pct}% от всех`,
          tone: 'emerald',
        });
      }
    }

    // Лидера по обороту показываем только в режиме «все сделки» —
    // курьеру/продавцу это сравнение не нужно (он видит только себя).
    if (data?.viewerScope !== 'self') {
      const ops = data?.byOperator || [];
      if (ops.length) {
        const top = [...ops].sort((a, b) => (b.sumRub || 0) - (a.sumRub || 0))[0];
        if (top && top.sumRub > 0) {
          const share = t.sumRub ? Math.round((top.sumRub / t.sumRub) * 100) : 0;
          out.push({
            k: 'top-op',
            icon: '★',
            title: 'Лидер по обороту',
            value: top.email || 'без учётки',
            sub: `${formatMoney(top.sumRub)} · ${share}% оборота`,
            tone: 'gold',
          });
        }
      }
    }

    if (t.deals > 0) {
      const avg = t.sumRub / t.deals;
      const dlt = delta(avg, tPrev && tPrev.deals ? tPrev.sumRub / tPrev.deals : null);
      out.push({
        k: 'avg',
        icon: '∑',
        title: 'Средний чек',
        value: formatMoney(Math.round(avg)),
        sub: dlt ? `к пред. периоду: ${dlt.pct == null ? '—' : `${dlt.pct >= 0 ? '+' : ''}${dlt.pct.toFixed(1)}%`}` : 'нет сравнения',
        tone: 'neutral',
      });
    }

    return out;
  }, [t, tPrev, data, byProbe, totalDealsByProbe, formatMoney]);

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
    if (!d) return { moneySeries: [], weightLabelKey: 'day' };
    if (group === 'day') {
      return {
        moneySeries: (d.byDay || []).map((x) => ({ ...x, x: x.day?.slice(5) || x.day })),
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

  // Сделок-по-пробе с долями
  const probesWithShare = useMemo(() => {
    return byProbe.map((p) => ({
      ...p,
      share: totalDealsByProbe ? (p.count / totalDealsByProbe) * 100 : 0,
    }));
  }, [byProbe, totalDealsByProbe]);

  return (
    <div className="analytics-page">
      {/* HERO: период, оборот, дельта */}
      <div className="an-hero">
        <div className="an-hero__top">
          <div className="an-hero__period">
            <span className="an-hero__kicker">
              Аналитика за период
              {data?.viewerScope === 'self' && (
                <span className="an-scope-badge" title="Видны только сделки, оформленные вами">
                  только мои сделки
                </span>
              )}
            </span>
            <h2 className="an-hero__title">
              {humanDateShort(from)} <span className="an-hero__dash">—</span> {humanDate(to)}
            </h2>
            <p className="an-hero__sub">
              {periodDays} {pluralDays(periodDays)} · сравнение с предыдущим таким же отрезком
              {tPrev ? '' : ' · нет данных за пред. период'}
            </p>
          </div>
          <div className="an-hero__money">
            <span className="an-hero__money-label">Оборот</span>
            <span className="an-hero__money-value mono-nums">{formatMoney(t?.sumRub ?? 0)}</span>
            <DeltaBadge d={delta(t?.sumRub, tPrev?.sumRub)} />
          </div>
        </div>

        <div className="an-presets">
          {[
            { id: 'today', t: 'Сегодня' },
            { id: '7d', t: '7 дней' },
            { id: '30d', t: '30 дней' },
            { id: '90d', t: '90 дней' },
            { id: 'month', t: 'Месяц' },
            { id: 'ytd', t: 'С 1 янв.' },
          ].map((b) => (
            <button
              key={b.id}
              type="button"
              className={`an-pill${activePreset === b.id ? ' an-pill--active' : ''}`}
              onClick={() => applyPreset(b.id)}
            >
              {b.t}
            </button>
          ))}
        </div>

        <div className="an-filters">
          <label className="an-field">
            <span className="an-field__l">С</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setActivePreset(null);
                setFrom(e.target.value);
              }}
            />
          </label>
          <label className="an-field">
            <span className="an-field__l">По</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setActivePreset(null);
                setTo(e.target.value);
              }}
            />
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
            {loading ? '…' : '↻ Обновить'}
          </button>
        </div>

        <details className="an-pdf-block">
          <summary>
            <span className="an-pdf-summary-l">PDF-отчёт</span>
            <span className="an-pdf-summary-r muted small">выбрать разделы и скачать</span>
          </summary>
          <div className="an-pdf-row">
            <div className="an-pdf-controls">
              {[
                { id: 'summary', label: 'Сводка (KPI)' },
                ...(data?.viewerScope === 'self' ? [] : [{ id: 'operators', label: 'Сотрудники' }]),
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
                  onClick={() => setPdfSec({ summary: true, operators: true, probe: true, series: true })}
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
        </details>
      </div>

      {err && <div className="glass analytics-err">{err}</div>}

      {/* KPI с дельтами и спарклайнами */}
      {t && !loading && (
        <div className="an-kpi-grid cg-stagger">
          {kpiCards.map((k) => (
            <div
              key={k.id}
              className={`an-kpi-card${k.hero ? ' an-kpi-card--hero' : ''}`}
            >
              <div className="an-kpi-card__head">
                <span className="an-kpi-card__icon" aria-hidden>
                  {k.icon}
                </span>
                <span className="an-kpi-card__label">{k.label}</span>
              </div>
              <div className="an-kpi-card__value mono-nums">{k.render(k.value)}</div>
              <div className="an-kpi-card__bottom">
                <DeltaBadge d={k.d} />
                {tPrev && k.d && k.d.pct != null && (
                  <span className="an-kpi-card__prev muted">
                    пред.: {k.id === 'sum' || k.id === 'avg' ? formatMoney(
                      Math.round(k.id === 'avg' ? (tPrev.deals ? tPrev.sumRub / tPrev.deals : 0) : tPrev.sumRub)
                    ) : new Intl.NumberFormat('ru-RU').format(
                      k.id === 'deals' ? tPrev.deals : tPrev.uniqueCustomers
                    )}
                  </span>
                )}
              </div>
              {/* спарклайн в фоне для оборота и сделок */}
              {(k.id === 'sum' || k.id === 'deals') && sparkData.length > 1 && (
                <div className="an-kpi-card__spark" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`spark-${k.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey={k.id === 'sum' ? 'sumRub' : 'count'}
                        stroke="var(--gold)"
                        strokeWidth={1.5}
                        fill={`url(#spark-${k.id})`}
                        animationDuration={1300}
                        animationEasing="ease-out"
                        animationBegin={420}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* INSIGHTS — авто-аналитика */}
      {insights.length > 0 && !loading && (
        <div className="an-insights cg-stagger">
          {insights.map((ins) => (
            <div
              key={ins.k}
              className={`an-insight an-insight--${ins.tone}`}
            >
              <div className="an-insight__icon" aria-hidden>{ins.icon}</div>
              <div className="an-insight__body">
                <div className="an-insight__title">{ins.title}</div>
                <div className="an-insight__value mono-nums">{ins.value}</div>
                <div className="an-insight__sub muted">{ins.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Двухколоночный grid: основные графики + сотрудники */}
      <div className="an-grid">
        <div className="an-grid__col an-grid__col--main">
          {/* Денежный поток — area chart */}
          {moneySeries.length > 0 && !loading && (
            <div className="glass analytics-chart-card an-anim">
              <div className="an-chart-head">
                <div>
                  <h3 className="analytics-h3">Денежный поток</h3>
                  <p className="muted small an-h3-sub">
                    Оборот {weightLabelKey === 'day' ? 'по дням' : weightLabelKey === 'week' ? 'по неделям' : 'по месяцам'}.
                    Заливка показывает накопленный объём.
                  </p>
                </div>
              </div>
              <div className="analytics-chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={moneySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="an-money-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.55} />
                        <stop offset="60%" stopColor="var(--gold)" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, #333)" opacity={0.5} />
                    <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload;
                        return (
                          <div className="an-tt">
                            <div className="an-tt__label">{label}</div>
                            <div className="an-tt__val">{formatMoney(p.sumRub || 0)}</div>
                            {p.count != null && <div className="an-tt__sub muted">сделок: {p.count}</div>}
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sumRub"
                      stroke="var(--gold)"
                      strokeWidth={2.5}
                      fill="url(#an-money-grad)"
                      activeDot={{ r: 5, fill: 'var(--gold)', stroke: 'var(--bg-deep)', strokeWidth: 2 }}
                      animationDuration={1500}
                      animationEasing="ease-out"
                      animationBegin={350}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Сделок по пробе — bar + таблица */}
          {byProbe.length > 0 && !loading && (
            <div className="glass analytics-chart-card an-anim">
              <h3 className="analytics-h3">Сделок по пробе</h3>
              <p className="muted small an-h3-sub">
                По первой строке таблицы в договоре (лом, до трёх позиций). Сделок, вес, сумма по пробе.
              </p>

              {/* Бары с долями */}
              <div className="an-probe-bars">
                {probesWithShare.map((p) => (
                  <div key={p.probe} className="an-probe-bar">
                    <div className="an-probe-bar__head">
                      <span className="an-probe-bar__name">{p.probe} пр.</span>
                      <span className="an-probe-bar__count mono-nums">{p.count} · {p.share.toFixed(0)}%</span>
                    </div>
                    <div className="an-probe-bar__track">
                      <div className="an-probe-bar__fill" style={{ width: `${Math.max(2, p.share)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="cg-table-wrap cg-table-wrap--scroll" role="region" aria-label="Сводка по пробам">
                <table className="cg-table cg-table--compact">
                  <thead>
                    <tr>
                      <th>Проба</th>
                      <th className="num">Сделок</th>
                      <th className="num">Вес, г (лом / чист.)</th>
                      <th className="num">Сумма, ₽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProbe.map((r) => (
                      <tr key={r.probe}>
                        <td>{r.probe} пр.</td>
                        <td className="num">{r.count}</td>
                        <td className="num small-digits">{formatProbeWeightGrossNet(r)}</td>
                        <td className="num">{r.sumRub != null ? formatMoney(r.sumRub) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Вес — динамика */}
          {moneySeries.length > 0 && !loading && (
            <div className="glass analytics-chart-card an-anim">
              <h3 className="analytics-h3">Вес золота — динамика</h3>
              <p className="muted small an-h3-sub">
                <span className="an-leg-pill an-leg-pill--gross">общий, г</span>
                <span className="an-leg-pill an-leg-pill--net">чистый, г</span>
                — по первой строке договора.
              </p>
              <div className="analytics-chart-h an-chart-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={moneySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, #333)" opacity={0.5} />
                    <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis yAxisId="g" tick={{ fontSize: 10 }} stroke="var(--text-muted)" allowDecimals />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]?.payload;
                        if (!p) return null;
                        return (
                          <div className="an-tt">
                            <div className="an-tt__label">{label}</div>
                            {p.weightGross != null && <div className="an-tt__val">Общий: {Number(p.weightGross).toFixed(2)} г</div>}
                            {p.weightNet != null && <div className="an-tt__sub">Чистый: {Number(p.weightNet).toFixed(3)} г</div>}
                          </div>
                        );
                      }}
                    />
                    <Line yAxisId="g" type="monotone" dataKey="weightGross" stroke="#6ee7b7" strokeWidth={2.2} dot={false} animationDuration={1400} animationEasing="ease-out" animationBegin={300} />
                    <Line yAxisId="g" type="monotone" dataKey="weightNet" stroke="#c084fc" strokeWidth={2.2} dot={false} animationDuration={1400} animationEasing="ease-out" animationBegin={520} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="an-grid__col an-grid__col--side">
          {/* Сотрудники — не показываем курьеру/продавцу: он видит только себя. */}
          {t && !loading && t.deals > 0 && data?.viewerScope !== 'self' && (
            <div className="glass analytics-op-card an-anim">
              <h3 className="analytics-h3">Сотрудники</h3>
              <p className="muted small an-h3-sub">Кто оформляет — по подписанным PDF договоров.</p>
              {Array.isArray(data?.byOperator) && data.byOperator.length > 0 ? (
                <div className="cg-table-wrap cg-table-wrap--scroll">
                  <table className="cg-table cg-table--compact">
                    <thead>
                      <tr>
                        <th>Учётная запись</th>
                        <th className="num">Сделок</th>
                        <th className="num">Оборот, ₽</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byOperator.map((row) => {
                        const share = t.sumRub ? Math.round(((row.sumRub || 0) / t.sumRub) * 100) : 0;
                        return (
                          <tr key={row.operatorId == null ? 'none' : String(row.operatorId)}>
                            <td>
                              <div className="an-op-cell">
                                <span className="an-op-cell__email">{row.email || '—'}</span>
                                <div className="an-op-cell__bar" aria-hidden>
                                  <div className="an-op-cell__bar-fill" style={{ width: `${Math.max(2, share)}%` }} />
                                </div>
                                <span className="muted small">{share}% оборота</span>
                              </div>
                            </td>
                            <td className="num">{row.deals}</td>
                            <td className="num">{formatMoney(row.sumRub)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted small" style={{ margin: '8px 0 0' }}>
                  Таблица сотрудников будет доступна после очередного обновления бэка.
                </p>
              )}
            </div>
          )}

          {/* Бар-чарт сделок-в-день для side колонки */}
          {sparkData.length > 0 && !loading && (
            <div className="glass analytics-chart-card an-anim">
              <h3 className="analytics-h3">Сделок по дням</h3>
              <p className="muted small an-h3-sub">Распределение количества сделок по календарным дням периода.</p>
              <div className="analytics-chart-h">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sparkData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, #333)" opacity={0.5} />
                    <XAxis dataKey="x" tick={{ fontSize: 10 }} tickFormatter={(v) => String(v).slice(5)} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} stroke="var(--text-muted)" />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload;
                        return (
                          <div className="an-tt">
                            <div className="an-tt__label">{label}</div>
                            <div className="an-tt__val">Сделок: {p.count}</div>
                            {p.sumRub != null && <div className="an-tt__sub muted">{formatMoney(p.sumRub)}</div>}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={1200} animationEasing="ease-out" animationBegin={350}>
                      {sparkData.map((entry, i) => (
                        <Cell key={i} fill={entry.count > 0 ? 'var(--gold)' : 'var(--stroke-soft)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {!loading && t?.deals === 0 && !err && (
        <EmptyState
          icon="chart"
          title="За этот период сделок нет"
          description="Сделки автоматически попадают в учёт после скачивания PDF договора. Попробуйте расширить диапазон дат или оформите первый договор."
        />
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonStats count={4} />
          <SkeletonChart height={220} />
          <SkeletonTable rows={5} cols={4} />
        </div>
      )}

      <style>{ANALYTICS_CSS}</style>
    </div>
  );
}

// ── CSS ─────────────────────────────────────────────────────────────────────
const ANALYTICS_CSS = `
.analytics-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; max-width: 100%; }

/* HERO */
.an-hero {
  position: relative;
  padding: 24px 22px 18px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 100% 0%, var(--gold-soft) 0%, transparent 55%),
    linear-gradient(180deg, var(--bg-panel-solid) 0%, var(--surface) 100%);
  border: 1px solid var(--stroke-soft);
  overflow: hidden;
}
.an-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 0% 100%, var(--gold-glow) 0%, transparent 50%);
  pointer-events: none;
  opacity: 0.6;
}
.an-hero__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 18px;
  position: relative;
  z-index: 1;
}
.an-hero__period { min-width: 0; }
.an-hero__kicker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--fz-micro);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 700;
  color: var(--gold);
  margin-bottom: 8px;
}
.an-scope-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--gold-soft);
  border: 1px solid var(--stroke-strong);
  color: var(--text);
  font-size: var(--fz-micro);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: none;
  white-space: nowrap;
  line-height: 1.2;
}
.an-scope-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 6px var(--gold-glow);
}
.an-hero__title {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 1.1rem + 1.4vw, 1.85rem);
  font-weight: 600;
  line-height: 1.14;
  letter-spacing: -0.014em;
  color: var(--text);
}
.an-hero__dash { color: var(--gold); margin: 0 6px; font-weight: 400; }
.an-hero__sub {
  margin: 0;
  font-size: var(--fz-body-sm);
  color: var(--text-muted);
  line-height: 1.5;
}

.an-hero__money {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 0;
}
.an-hero__money-label {
  font-size: var(--fz-micro);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  font-weight: 700;
}
.an-hero__money-value {
  font-family: var(--font-display);
  font-size: clamp(1.65rem, 1.2rem + 1.8vw, 2.25rem);
  font-weight: 600;
  color: var(--gold);
  line-height: 1.05;
  letter-spacing: -0.015em;
  text-shadow: 0 2px 24px var(--gold-glow);
  font-variant-numeric: tabular-nums;
}

/* PRESETS */
.an-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 16px 0 12px;
  position: relative;
  z-index: 1;
}
.an-pill {
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.an-pill:hover { border-color: var(--gold); color: var(--gold); }
.an-pill--active {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dim) 100%);
  color: #1c1108;
  border-color: var(--gold);
  box-shadow: 0 2px 12px var(--gold-glow);
}

/* FILTERS */
.an-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  position: relative;
  z-index: 1;
}
.an-field { display: flex; flex-direction: column; gap: 4px; }
.an-field__l { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.an-field input {
  background: var(--input-bg);
  border: 1px solid var(--stroke-soft);
  color: var(--text);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.85rem;
  min-width: 9rem;
}
.an-field input:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
.an-group-btns {
  display: flex; gap: 2px; padding: 3px; border-radius: 12px;
  background: var(--input-bg); border: 1px solid var(--stroke-soft);
}
.an-group-btn {
  border: none; background: transparent; color: var(--text-muted);
  font-size: 0.78rem; padding: 7px 12px; border-radius: 9px; cursor: pointer; font-weight: 600;
  transition: all 0.12s ease;
}
.an-group-btn.active {
  background: var(--surface);
  color: var(--gold);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* PDF block */
.an-pdf-block {
  margin-top: 14px;
  border: 1px solid var(--stroke-soft);
  border-radius: 12px;
  background: var(--surface);
  position: relative;
  z-index: 1;
}
.an-pdf-block summary {
  list-style: none;
  padding: 10px 14px;
  cursor: pointer;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.85rem;
}
.an-pdf-block summary::-webkit-details-marker { display: none; }
.an-pdf-block summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 8px;
  transition: transform 0.18s ease;
  color: var(--gold);
}
.an-pdf-block[open] summary::before { transform: rotate(90deg); }
.an-pdf-summary-l { font-weight: 700; color: var(--text); }
.an-pdf-row { padding: 12px 14px; border-top: 1px solid var(--stroke-soft); }
.an-pdf-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.an-pdf-cb { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; cursor: pointer; }
.an-pdf-cb input { width: 16px; height: 16px; accent-color: var(--gold); }
.an-pdf-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.an-pdf-download { font-weight: 700; }

/* DELTA BADGE */
.an-delta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
}
.an-delta__arrow { font-size: 0.7rem; line-height: 1; }
.an-delta--up { background: var(--emerald-soft); color: var(--emerald); }
.an-delta--down { background: rgba(176, 56, 56, 0.15); color: var(--crimson); }
.an-delta--flat { background: var(--surface); color: var(--text-muted); border: 1px solid var(--stroke-soft); }

/* KPI GRID */
.an-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (min-width: 720px) { .an-kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

.an-kpi-card {
  position: relative;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
  overflow: hidden;
  transition:
    transform 280ms var(--ease-out),
    border-color 220ms var(--ease-out),
    box-shadow 320ms var(--ease-out);
}
.an-kpi-card:hover {
  transform: translateY(-3px);
  border-color: var(--gold);
  box-shadow: 0 14px 32px rgba(0,0,0,0.10), 0 0 0 1px var(--gold-soft);
}
.an-kpi-card--hero {
  background: linear-gradient(135deg, var(--bg-panel-solid) 0%, var(--gold-soft) 100%);
  border-color: var(--gold);
}
.an-kpi-card--hero .an-kpi-card__value { color: var(--gold); }
.an-kpi-card__head { display: flex; align-items: center; gap: 8px; }
.an-kpi-card__icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--gold-soft);
  color: var(--gold);
  font-size: 0.9rem;
  font-weight: 700;
}
.an-kpi-card__label {
  font-size: var(--fz-micro);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 700;
}
.an-kpi-card__value {
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 1.1rem + 0.8vw, 1.55rem);
  font-weight: 600;
  color: var(--text);
  line-height: 1.1;
  letter-spacing: -0.012em;
  font-variant-numeric: tabular-nums;
}
.an-kpi-card__bottom {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.75rem;
  flex-wrap: wrap;
}
.an-kpi-card__prev { font-size: 0.7rem; }
.an-kpi-card__spark {
  position: absolute;
  inset: auto 0 0 0;
  height: 38px;
  opacity: 0.55;
  pointer-events: none;
}

/* INSIGHTS */
.an-insights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.an-insight {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  min-width: 0;
  transition:
    transform 260ms var(--ease-out),
    box-shadow 260ms var(--ease-out),
    border-color 220ms var(--ease-out);
}
.an-insight:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0,0,0,0.10);
  border-color: var(--stroke-strong);
}
.an-insight--gold { border-left: 3px solid var(--gold); }
.an-insight--emerald { border-left: 3px solid var(--emerald); }
.an-insight--neutral { border-left: 3px solid var(--stroke-strong); }
.an-insight__icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--gold-soft);
  color: var(--gold);
  font-size: 1.05rem;
  flex-shrink: 0;
}
.an-insight--emerald .an-insight__icon { background: var(--emerald-soft); color: var(--emerald); }
.an-insight--neutral .an-insight__icon { background: var(--bg-panel-solid); color: var(--text); }
.an-insight__body { min-width: 0; flex: 1; }
.an-insight__title {
  font-size: var(--fz-micro);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 3px;
}
.an-insight__value {
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.22;
  letter-spacing: -0.012em;
  word-break: break-word;
}
.an-insight__sub { font-size: var(--fz-small); margin-top: 3px; line-height: 1.4; }

/* GRID — 2 columns on wide screens */
.an-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
@media (max-width: 1100px) {
  .an-grid { grid-template-columns: minmax(0, 1fr); }
}
.an-grid__col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

/* CHART CARDS */
.analytics-chart-card { padding: 18px 18px 14px; min-width: 0; }
.analytics-op-card { padding: 18px; min-width: 0; }
.analytics-h3 {
  font-family: var(--font-display);
  font-size: var(--fz-h3);
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--text);
  letter-spacing: -0.005em;
  line-height: 1.25;
}
.an-h3-sub { margin: 0 0 14px; line-height: 1.5; font-size: var(--fz-body-sm); }
.analytics-chart-h { width: 100%; min-width: 0; height: 240px; }
.an-chart-tall { height: 260px; }
.an-chart-head { margin-bottom: 4px; }
.an-anim { animation: cgFadeUp var(--t-base) var(--ease-out) backwards; }
.an-anim:nth-child(1) { animation-delay: 80ms; }
.an-anim:nth-child(2) { animation-delay: 180ms; }
.an-anim:nth-child(3) { animation-delay: 280ms; }

/* PROBE BARS */
.an-probe-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 6px 0 14px;
}
.an-probe-bar { display: flex; flex-direction: column; gap: 4px; }
.an-probe-bar__head { display: flex; justify-content: space-between; font-size: 0.82rem; }
.an-probe-bar__name { font-weight: 600; color: var(--text); }
.an-probe-bar__count { color: var(--text-muted); font-size: 0.78rem; }
.an-probe-bar__track {
  height: 8px; border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  overflow: hidden;
}
.an-probe-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold) 0%, var(--gold-dim) 100%);
  border-radius: 999px;
  box-shadow: 0 0 8px var(--gold-glow);
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* OPERATORS — bar в ячейке */
.an-op-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.an-op-cell__email {
  font-weight: 600;
  font-size: 0.85rem;
  word-break: break-all;
}
.an-op-cell__bar {
  height: 4px; border-radius: 999px; background: var(--surface);
  border: 1px solid var(--stroke-soft);
  overflow: hidden;
}
.an-op-cell__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--gold-dim));
  transition: width 0.4s ease;
}

/* TOOLTIPS */
.an-tt {
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-strong);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.82rem;
  box-shadow: 0 6px 22px rgba(0,0,0,0.2);
  min-width: 120px;
}
.an-tt__label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 3px;
}
.an-tt__val {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--gold);
  font-size: 0.95rem;
}
.an-tt__sub { margin-top: 2px; font-size: 0.78rem; color: var(--text); }

/* LEGEND PILLS */
.an-leg-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.74rem;
  margin-right: 10px;
  font-weight: 600;
}
.an-leg-pill::before {
  content: '';
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
}
.an-leg-pill--gross::before { background: #6ee7b7; box-shadow: 0 0 6px #6ee7b7; }
.an-leg-pill--net::before { background: #c084fc; box-shadow: 0 0 6px #c084fc; }

.analytics-err { padding: 12px 16px; color: var(--crimson, #d63b3b); font-size: 0.9rem; }
.small-digits { font-size: 0.95rem; }

@media (max-width: 720px) {
  .an-hero { padding: 18px 16px 14px; }
  .an-hero__title { font-size: 1.25rem; }
  .an-hero__money-value { font-size: 1.6rem; }
  .an-hero__top { flex-direction: column; align-items: flex-start; }
  .an-hero__money { align-items: flex-start; }
  .analytics-chart-card, .analytics-op-card { padding: 14px; }
  .analytics-h3 { font-size: 0.95rem; }
  .analytics-chart-h { height: 200px; }
  .an-chart-tall { height: 220px; }
}
`;
