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
import { PageHint } from './PageHint.jsx';

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

  // ── AI (Grok) по выбранному периоду ──
  const [aiQ, setAiQ] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiErr, setAiErr] = useState(null);

  const askAi = useCallback(async (preset) => {
    const question = String(preset ?? aiQ).trim();
    if (!question || aiBusy) return;
    setAiQ(question);
    setAiBusy(true);
    setAiErr(null);
    setAiAnswer(null);
    try {
      const r = await api.aiAsk(question, from, to);
      setAiAnswer(r?.answer || '');
    } catch (e) {
      setAiErr(e?.message || 'AI не ответил, попробуйте ещё раз');
    } finally {
      setAiBusy(false);
    }
  }, [aiQ, aiBusy, from, to]);

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

    // Крупнейшая сделка периода (приходит с сервера).
    if (data?.maxDeal && data.maxDeal.totalRub > 0) {
      const md = data.maxDeal;
      out.push({
        k: 'max-deal',
        icon: '◇',
        title: 'Крупнейшая сделка',
        value: formatMoney(md.totalRub),
        sub: [
          md.sellerName,
          md.probe ? `${md.probe} пр.` : null,
          md.createdAt ? humanDateShort(String(md.createdAt).slice(0, 10)) : null,
        ].filter(Boolean).join(' · ') || 'детали в базе клиентов',
        tone: 'gold',
      });
    }

    // Весь лом / чистое золото, прошедшие через программу за период.
    {
      const wg = numish(t.firstRowWeightGrossSum);
      const wn = numish(t.firstRowWeightNetSum);
      if (wg != null && wg > 0) {
        out.push({
          k: 'gold-total',
          icon: '⚖',
          title: 'Золота через программу',
          value: `${wg.toFixed(1)} г`,
          sub: `чистого ≈ ${wn != null ? wn.toFixed(1) : '—'} г · лом по договорам`,
          tone: 'emerald',
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
      const { openAnalyticsReport } = await import('./analyticsReport.js');
      let authorName = '';
      try {
        const me = await api.me();
        authorName = me?.user?.displayName || me?.user?.email || '';
      } catch { /* ignore */ }
      const ok = await openAnalyticsReport({
        data,
        prevData,
        sections: keys,
        formatMoney,
        periodLabel: `${humanDate(from)} — ${humanDate(to)}`,
        moneySeries,
        authorName,
        group,
      });
      if (!ok) toast?.('Не удалось скачать PDF-отчёт', 'error');
      else toast?.('PDF-отчёт скачан', 'success');
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
      <PageHint id="analytics" title="Как читать аналитику">
        Выберите период вверху — все цифры и графики пересчитаются. <b>Каналы оформления</b> показывают долю отделения и доставки. Кнопка <b>PDF-отчёт</b> выгрузит сводку с графиками. Строка <b>AI-аналитик</b> ответит на вопросы по данным периода.
      </PageHint>
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
          <button
            type="button"
            className="an-export-pdf"
            onClick={exportPdf}
            disabled={loading || pdfBusy}
            title="Скачать PDF с выбранными разделами"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
            {pdfBusy ? 'Формируем…' : 'Выгрузить PDF'}
          </button>
        </div>

        <details className="an-pdf-block">
          <summary>
            <span className="an-pdf-summary-l">Разделы PDF-отчёта</span>
            <span className="an-pdf-summary-r muted small">отметьте, что войдёт в выгрузку</span>
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
                        animationDuration={1700}
                        animationEasing="ease"
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

      {/* INSIGHTS — акцентные карточки периода */}
      {insights.length > 0 && !loading && (
        <div className="an-insights">
          {insights.map((ins, idx) => (
            <div
              key={ins.k}
              className={`an-insight an-insight--${ins.tone}`}
              style={{ '--idx': idx }}
            >
              <div className="an-insight__chip" aria-hidden>{ins.icon}</div>
              <div className="an-insight__label">{ins.title}</div>
              <div className="an-insight__value mono-nums">{ins.value}</div>
              <div className="an-insight__sub">{ins.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Каналы: отделение vs доставка */}
      {!loading && t && data?.channels && (t.deals > 0) && (
        <div className="an-channels an-anim">
          <h3 className="analytics-h3" style={{ margin: '0 0 4px' }}>Каналы оформления</h3>
          <p className="muted small" style={{ margin: '0 0 14px' }}>
            Сделки в отделении (скачан PDF) против доставки (курьер, подтверждение по СМС).
          </p>
          <div className="an-ch-grid">
            {[
              { key: 'office', label: 'В отделении', icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
              ) },
              { key: 'delivery', label: 'Доставка / курьер', icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1.5"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              ) },
            ].map(({ key, label, icon }) => {
              const ch = data.channels[key] || { deals: 0, sumRub: 0, weightGross: 0, weightNet: 0 };
              const pct = t.sumRub > 0 ? Math.round((ch.sumRub / t.sumRub) * 100) : 0;
              return (
                <div key={key} className={`an-ch an-ch--${key}`}>
                  <div className="an-ch__head">
                    <span className="an-ch__chip" aria-hidden>{icon}</span>
                    <span className="an-ch__label">{label}</span>
                    <span className="an-ch__pct">{pct}%</span>
                  </div>
                  <div className="an-ch__value mono-nums">{formatMoney(ch.sumRub)}</div>
                  <div className="an-ch__bar"><div className="an-ch__bar-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="an-ch__meta">
                    <span>{ch.deals} сд.</span>
                    <span>{(ch.weightGross || 0).toFixed(2)} г лом</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Grok по выбранному периоду */}
      {!loading && t && (
        <div className="an-ai an-anim">
          <div className="an-ai-head">
            <span className="an-ai-badge" aria-hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" opacity="0.7" />
              </svg>
            </span>
            <div>
              <h3 className="analytics-h3" style={{ margin: 0 }}>AI-аналитик Grok</h3>
              <p className="muted small" style={{ margin: '2px 0 0' }}>
                Анализ и прогнозы по данным за {humanDateShort(from)} — {humanDateShort(to)}
              </p>
            </div>
          </div>
          <form className="an-ai-row" onSubmit={(e) => { e.preventDefault(); askAi(); }}>
            <input
              className="an-ai-input"
              type="text"
              value={aiQ}
              onChange={(e) => setAiQ(e.target.value)}
              placeholder="Например: что выделяется в этом периоде и на что обратить внимание?"
              maxLength={600}
              disabled={aiBusy}
            />
            <button type="submit" className="an-ai-send" disabled={aiBusy || !aiQ.trim()}>
              {aiBusy ? 'Думает…' : 'Спросить'}
            </button>
          </form>
          <div className="an-ai-chips">
            {['Проанализируй этот период', 'Что с динамикой по пробам?', 'Дай прогноз на следующий период'].map((s) => (
              <button key={s} type="button" className="an-ai-chip" onClick={() => askAi(s)} disabled={aiBusy}>
                {s}
              </button>
            ))}
          </div>
          {(aiBusy || aiAnswer || aiErr) && (
            <div className="an-ai-result">
              {aiBusy && (
                <div className="an-ai-thinking">
                  Grok анализирует период
                  <span className="an-ai-dot" /><span className="an-ai-dot" /><span className="an-ai-dot" />
                </div>
              )}
              {!aiBusy && aiErr && <div className="an-ai-err">{aiErr}</div>}
              {!aiBusy && !aiErr && aiAnswer && <div className="an-ai-answer">{aiAnswer}</div>}
            </div>
          )}
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
                      animationDuration={1900}
                      animationEasing="ease"
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
                    <defs>
                      <linearGradient id="an-wgross-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--emerald)" stopOpacity={0.42} />
                        <stop offset="65%" stopColor="var(--emerald)" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="var(--emerald)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="an-wnet-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                        <stop offset="65%" stopColor="var(--accent)" stopOpacity={0.1} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 7" stroke="var(--stroke-soft, #333)" vertical={false} />
                    <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--text-muted)" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="g" tick={{ fontSize: 10 }} stroke="var(--text-muted)" axisLine={false} tickLine={false} allowDecimals />
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
                    <Area yAxisId="g" type="monotone" dataKey="weightGross" stroke="var(--emerald)" strokeWidth={2.4} fill="url(#an-wgross-grad)" dot={false} activeDot={{ r: 4, fill: 'var(--emerald)' }} animationDuration={1500} animationEasing="ease" animationBegin={300} />
                    <Area yAxisId="g" type="monotone" dataKey="weightNet" stroke="var(--accent)" strokeWidth={2.4} fill="url(#an-wnet-grad)" dot={false} activeDot={{ r: 4, fill: 'var(--accent)' }} animationDuration={1500} animationEasing="ease" animationBegin={520} />
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
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={1700} animationEasing="ease" animationBegin={350}>
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
  color: var(--text-strong);
  line-height: 1.05;
  letter-spacing: -0.015em;
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
  color: #fff;
  border-color: var(--gold);
  box-shadow: 0 2px 12px var(--gold-glow);
}
.an-pill--active:hover { color: #fff; border-color: var(--gold); }

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
  color: var(--text-strong);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 0.85rem;
  min-width: 9rem;
  color-scheme: dark light;
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

/* PDF export — как в «Команда и KPI» */
.an-export-pdf {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  background: var(--accent-grad);
  color: #fff;
  box-shadow: 0 4px 16px var(--accent-glow);
  transition: transform 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 180ms, filter 180ms, opacity 180ms;
  font-family: inherit;
}
.an-export-pdf:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px var(--accent-glow);
  filter: brightness(1.05);
}
.an-export-pdf:disabled { opacity: 0.45; cursor: not-allowed; }

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
.an-kpi-card--hero .an-kpi-card__value { color: var(--text-strong); }
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
/* Свечение основных линий графиков — как на дашборде */
.analytics-chart-card .recharts-area-curve,
.analytics-chart-card .recharts-line-curve {
  filter: drop-shadow(0 0 6px var(--accent-glow));
}

/* ── AI Grok ── */
.an-ai {
  border-radius: 16px;
  padding: 18px 20px;
  border: 1px solid transparent;
  background:
    linear-gradient(var(--bg-panel-solid), var(--bg-panel-solid)) padding-box,
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 45%, var(--stroke-soft)), var(--stroke-soft) 38%, var(--stroke-soft) 62%, color-mix(in srgb, var(--accent) 30%, var(--stroke-soft))) border-box;
  box-shadow: var(--shadow-card);
}
.an-ai-head { display: flex; align-items: center; gap: 11px; margin-bottom: 13px; }
.an-ai-badge {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--accent-grad);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.an-ai-row { display: flex; gap: 8px; }
.an-ai-input {
  flex: 1;
  min-width: 0;
  padding: 11px 15px;
  border-radius: 11px;
  border: 1px solid var(--stroke);
  background: var(--surface);
  color: var(--text);
  font-size: 0.88rem;
  font-family: var(--font-ui);
  transition: border-color 0.18s, box-shadow 0.18s;
}
.an-ai-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.an-ai-input::placeholder { color: var(--text-dim); }
.an-ai-send {
  padding: 0 20px;
  border-radius: 11px;
  border: none;
  background: var(--accent-grad);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 14px var(--accent-glow);
  transition: filter 0.18s, transform 0.15s, opacity 0.18s;
}
.an-ai-send:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.an-ai-send:disabled { opacity: 0.55; cursor: not-allowed; }
.an-ai-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
.an-ai-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.76rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s, color 0.16s, background 0.16s;
}
.an-ai-chip:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.an-ai-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.an-ai-result {
  margin-top: 13px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  animation: anAiIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes anAiIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.an-ai-thinking { display: flex; align-items: center; gap: 4px; font-size: 0.84rem; color: var(--text-muted); }
.an-ai-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--accent);
  animation: anAiDot 1.2s ease-in-out infinite;
}
.an-ai-dot:nth-child(2) { animation-delay: 0.15s; }
.an-ai-dot:nth-child(3) { animation-delay: 0.3s; }
.an-ai-dot:first-of-type { margin-left: 6px; }
@keyframes anAiDot {
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
.an-ai-answer { font-size: 0.875rem; line-height: 1.6; color: var(--text); white-space: pre-wrap; }
.an-ai-err { font-size: 0.84rem; color: var(--crimson); }
@media (max-width: 640px) {
  .an-ai-row { flex-direction: column; }
  .an-ai-send { padding: 11px 20px; }
}

/* ── Каналы: отделение vs доставка ── */
.an-channels {
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  border-radius: 18px;
  padding: 20px;
}
.an-ch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 560px) { .an-ch-grid { grid-template-columns: 1fr; } }
.an-ch {
  padding: 16px; border-radius: 16px;
  border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
  display: flex; flex-direction: column; gap: 10px;
  transition: box-shadow 220ms, transform 220ms;
}
.an-ch:hover { box-shadow: var(--shadow-pop); transform: translateY(-2px); }
.an-ch__head { display: flex; align-items: center; gap: 10px; }
.an-ch__chip {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.an-ch--office .an-ch__chip { background: var(--accent-soft); color: var(--accent); }
.an-ch--delivery .an-ch__chip { background: var(--emerald-soft); color: var(--emerald); }
.an-ch__label { font-size: 0.86rem; font-weight: 600; flex: 1; min-width: 0; }
.an-ch__pct { font-size: 0.82rem; font-weight: 700; color: var(--text-muted); }
.an-ch__value { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; font-family: var(--font-display); color: var(--text-strong); }
.an-ch__bar { height: 6px; border-radius: 999px; background: var(--surface); overflow: hidden; }
.an-ch__bar-fill { height: 100%; border-radius: 999px; transition: width 600ms cubic-bezier(0.22,1,0.36,1); }
.an-ch--office .an-ch__bar-fill { background: var(--accent-grad); }
.an-ch--delivery .an-ch__bar-fill { background: linear-gradient(135deg, var(--emerald), var(--emerald-strong)); }
.an-ch__meta { display: flex; justify-content: space-between; font-size: 0.74rem; color: var(--text-muted); }

/* ── Инсайты (акцентные карточки периода) ── */
.an-insights {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.an-insight {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  min-width: 0;
  position: relative;
  overflow: hidden;
  animation: dxIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--idx, 0) * 50ms);
  will-change: transform, opacity;
  transition:
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 260ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 220ms;
}
.an-insight:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-pop);
}

/* фоновое свечение в углу по тону */
.an-insight::before {
  content: '';
  position: absolute;
  top: -40%; right: -20%;
  width: 70%; height: 80%;
  border-radius: 50%;
  filter: blur(38px);
  pointer-events: none;
  opacity: 0;
  transition: opacity 300ms;
}
.an-insight:hover::before { opacity: 1; }
.an-insight--gold::before  { background: var(--gold-soft); }
.an-insight--emerald::before { background: var(--emerald-soft); }
.an-insight--neutral::before { background: var(--stroke-soft); }

/* тёмная тема — lightly tinted background per tone */
:root[data-theme='dark'] .an-insight--gold {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 9%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 55%);
  border-color: color-mix(in srgb, var(--accent) 22%, var(--stroke-soft));
}
:root[data-theme='dark'] .an-insight--emerald {
  background: linear-gradient(160deg, color-mix(in srgb, var(--emerald) 7%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 55%);
  border-color: color-mix(in srgb, var(--emerald) 18%, var(--stroke-soft));
}

.an-insight__chip {
  width: 30px; height: 30px;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.92rem;
  flex-shrink: 0;
  margin-bottom: 14px;
  position: relative;
}
.an-insight--gold    .an-insight__chip { background: var(--gold-soft); color: var(--gold); }
.an-insight--emerald .an-insight__chip { background: var(--emerald-soft); color: var(--emerald); }
.an-insight--neutral .an-insight__chip { background: var(--stroke-soft); color: var(--text-muted); }

.an-insight__label {
  font-size: 0.67rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-dim);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.an-insight__value {
  font-family: var(--font-display);
  font-size: clamp(1.15rem, 0.9rem + 0.9vw, 1.55rem);
  font-weight: 700;
  color: var(--text-strong);
  line-height: 1.15;
  letter-spacing: -0.018em;
  word-break: break-word;
  margin-bottom: 6px;
}
.an-insight--gold    .an-insight__value { color: var(--text-strong); }
.an-insight--emerald .an-insight__value { color: var(--text-strong); }

.an-insight__sub {
  font-size: 0.73rem;
  color: var(--text-dim);
  line-height: 1.45;
  margin-top: auto;
}

@media (max-width: 900px) {
  .an-insights { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 540px) {
  .an-insights { grid-template-columns: 1fr; gap: 8px; }
  .an-insight { padding: 15px 15px 13px; }
}

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
.an-leg-pill--gross::before { background: var(--emerald); box-shadow: 0 0 6px var(--emerald); }
.an-leg-pill--net::before { background: var(--accent); box-shadow: 0 0 6px var(--accent); }

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
