import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { api } from './api.js';
import { PageHint } from './PageHint.jsx';
/**
 * Дашборд — главный рабочий экран после входа (Stage 7).
 *
 * Блоки:
 *  - Живая котировка золота (имитация биржевого тикера вокруг реального курса).
 *  - KPI за 30 дней с дельтами к предыдущему периоду (оборот, сделки, клиенты, чек).
 *  - Денежный поток (area-график по дням).
 *  - «Сегодня» + быстрые действия.
 *  - Топ сотрудников по обороту.
 *  - Рынок: наша цена против конкурентов по городам (индекс золота).
 */

// ── helpers ──────────────────────────────────────────────────────────────────
function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
const fmtAxisNum = new Intl.NumberFormat('ru-RU');
function fmtAxis(v) { return fmtAxisNum.format(Math.round(v)); }

const AI_SUGGESTIONS = [
  'Как прошли последние 30 дней?',
  'Какая динамика сделок и оборота?',
  'Дай прогноз на следующий месяц',
];

function fmtDealTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  const sameDay = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  if (sameDay) return `сегодня ${hh}:${mm}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`;
}

function deltaPct(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Анимированный счётчик: rAF + easeOutExpo. Перезапускается при смене value. */
function useCountUp(value, { duration = 1100, decimals = 0 } = {}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) { setDisplay(0); return undefined; }
    const from = fromRef.current;
    const diff = value - from;
    if (diff === 0) { setDisplay(value); return undefined; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo
      const v = from + diff * eased;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (value == null || !Number.isFinite(value)) return null;
  return Number(display.toFixed(decimals));
}

/** Кастомная фигура свечи для Recharts Bar (dataKey → [low, high]). */
function CandleShape({ x, y, width, height, payload }) {
  if (!payload || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { o, c, h, l } = payload;
  const range = h - l || 1;
  const up = c >= o;
  const color = up ? 'var(--emerald)' : 'var(--crimson)';
  const cx = x + width / 2;
  const bodyTop = y + ((h - Math.max(o, c)) / range) * height;
  const bodyBot = y + ((h - Math.min(o, c)) / range) * height;
  const bw = Math.max(3, Math.min(11, width * 0.62));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <rect
        x={cx - bw / 2}
        y={bodyTop}
        width={bw}
        height={Math.max(1.6, bodyBot - bodyTop)}
        fill={color}
        rx={1.5}
        opacity={up ? 0.95 : 0.9}
      />
    </g>
  );
}

/** Бейдж дельты: ▲ +12.5% / ▼ -3.2% */
function DeltaBadge({ pct, invert = false }) {
  if (pct == null) return <span className="dx-delta dx-delta--na">—</span>;
  const good = invert ? pct < 0 : pct >= 0;
  return (
    <span className={`dx-delta ${good ? 'dx-delta--up' : 'dx-delta--down'}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── живой тикер котировки ────────────────────────────────────────────────────
const TICKS_MAX = 90;
const TICK_MS = 2000;

// Таймфреймы: чем длиннее период, тем выше «накопленная» волатильность истории.
const TIMEFRAMES = [
  { key: '5m', label: '5М', vol: 0.0009, windowMs: 5 * 60_000 },
  { key: '15m', label: '15М', vol: 0.0016, windowMs: 15 * 60_000 },
  { key: '1h', label: '1Ч', vol: 0.0032, windowMs: 60 * 60_000 },
  { key: '1d', label: '1Д', vol: 0.0075, windowMs: 24 * 60 * 60_000 },
];

const CANDLE_CHUNK = 5; // тиков на одну свечу → 18 свечей на графике

function fmtTickTime(ms, tfKey) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (tfKey === '5m' || tfKey === '15m') {
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  if (tfKey === '1d') {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hh}:${mm}`;
  }
  return `${hh}:${mm}`;
}

// Параметры «биржевого» процесса: возврат к среднему (mean-reversion) + случайный шаг.
// theta — сила притяжения к реальной цене, sigma — амплитуда шага. Так линия выглядит
// органично (как настоящий тикер), но не уходит далеко от курса.
const MR_THETA = 0.14;

/** Один шаг процесса Орнштейна–Уленбека вокруг target. */
function nextTickValue(last, target, vol) {
  const sigma = target * vol * 0.55;
  const drift = (target - last) * MR_THETA;
  const v = last + drift + (Math.random() - 0.5) * 2 * sigma;
  return Math.round(v * 100) / 100;
}

function seedTicks(target, vol, windowMs) {
  // История периода: возврат-к-среднему random-walk вокруг реальной цены —
  // живой «биржевой» вид без накопленного дрейфа, всегда около текущего курса.
  const out = [];
  const now = Date.now();
  const step = windowMs / TICKS_MAX;
  let v = target;
  for (let i = 0; i < TICKS_MAX; i++) {
    v = nextTickValue(v, target, vol);
    out.push({ i, v, t: now - (TICKS_MAX - 1 - i) * step });
  }
  return out;
}

export function Dashboard({ formatMoney, price, user, onNavigate }) {
  const goldRub = price?.goldRubPerGram ?? null;

  // ── котировка: тики ──
  const [ticks, setTicks] = useState([]);
  const [seeded, setSeeded] = useState(false);
  const [tf, setTf] = useState('15m');
  const [chartType, setChartType] = useState('area'); // area | candles
  const tfConf = TIMEFRAMES.find((x) => x.key === tf) ?? TIMEFRAMES[1];
  const tfVol = tfConf.vol;
  const tickIdRef = useRef(TICKS_MAX);
  const goldRef = useRef(goldRub);
  goldRef.current = goldRub;
  const seedTargetRef = useRef(null); // цена, вокруг которой построена текущая история
  // «Умная» заморозка: если курс перестал обновляться (stale) — держим последнее значение,
  // не рисуем фейковое «живое» движение поверх мёртвых данных.
  const priceStaleRef = useRef(false);
  priceStaleRef.current = !!price?.stale;

  const hasGold = goldRub != null;
  useEffect(() => {
    const g = goldRef.current;
    if (g == null) return;
    setTicks(seedTicks(g, tfConf.vol, tfConf.windowMs));
    seedTargetRef.current = g;
    setSeeded(true);
  }, [hasGold, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  // Реальная цена изменилась заметно (>0.4%) — пересобираем историю вокруг неё,
  // чтобы график мгновенно «переехал» к актуальному курсу, а не подтягивался долго.
  useEffect(() => {
    if (!seeded || goldRub == null) return;
    const base = seedTargetRef.current;
    if (base == null) return;
    if (Math.abs(goldRub - base) / base > 0.004) {
      setTicks(seedTicks(goldRub, tfConf.vol, tfConf.windowMs));
      seedTargetRef.current = goldRub;
    }
  }, [goldRub, seeded, tfConf.vol, tfConf.windowMs]);

  useEffect(() => {
    if (!seeded) return undefined;
    const t = setInterval(() => {
      const target = goldRef.current;
      if (target == null) return;
      setTicks((prev) => {
        const id = tickIdRef.current++;
        const last = prev[prev.length - 1]?.v ?? target;
        // Курс не обновляется → держим последнее значение (умная заморозка).
        // Иначе — живой шаг процесса возврата-к-среднему вокруг реальной цены.
        const v = priceStaleRef.current ? last : nextTickValue(last, target, tfVol);
        const next = [...prev.slice(-(TICKS_MAX - 1)), { i: id, v, t: Date.now() }];
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [seeded, tfVol]);

  // Свечи: чанкуем тики по CANDLE_CHUNK → OHLC + условный объём (для «терминального» вида).
  const candles = useMemo(() => {
    const out = [];
    for (let i = 0; i + CANDLE_CHUNK <= ticks.length; i += CANDLE_CHUNK) {
      const chunk = ticks.slice(i, i + CANDLE_CHUNK);
      const o = chunk[0].v;
      const c = chunk[chunk.length - 1].v;
      let h = -Infinity; let l = Infinity;
      for (const x of chunk) { if (x.v > h) h = x.v; if (x.v < l) l = x.v; }
      // Объём пропорционален размаху свечи + детерминированный шум (стабилен между рендерами).
      const seed = Math.abs(Math.sin(chunk[0].i * 12.9898) * 43758.5453) % 1;
      const vol = Math.round(((h - l) / (c || 1)) * 1e6 * (0.55 + seed * 0.9)) + 12;
      out.push({ i: chunk[0].i, t: chunk[chunk.length - 1].t, o, c, h, l, vol });
    }
    return out;
  }, [ticks]);

  const maxVol = useMemo(() => candles.reduce((m, x) => Math.max(m, x.vol), 0), [candles]);

  // Статистика периода: открытие / максимум / минимум / последняя цена.
  const quoteStats = useMemo(() => {
    if (ticks.length < 2) return null;
    let h = -Infinity; let l = Infinity;
    for (const x of ticks) { if (x.v > h) h = x.v; if (x.v < l) l = x.v; }
    return { o: ticks[0].v, h, l, last: ticks[ticks.length - 1].v };
  }, [ticks]);

  const sessionDelta = useMemo(() => {
    if (ticks.length < 2) return null;
    const first = ticks[0].v;
    const last = ticks[ticks.length - 1].v;
    return deltaPct(last, first);
  }, [ticks]);

  const tickDomain = useMemo(() => {
    if (!ticks.length) return ['auto', 'auto'];
    let lo = Infinity; let hi = -Infinity;
    for (const t of ticks) { if (t.v < lo) lo = t.v; if (t.v > hi) hi = t.v; }
    // Гарантируем, что реальная цена (и её опорная линия) всегда в диапазоне.
    if (goldRub != null) { if (goldRub < lo) lo = goldRub; if (goldRub > hi) hi = goldRub; }
    const pad = Math.max((hi - lo) * 0.25, hi * 0.0005);
    return [lo - pad, hi + pad];
  }, [ticks, goldRub]);

  // ── данные разделов ──
  const [cur, setCur] = useState(null);     // analyticsSummary 30д
  const [prev, setPrev] = useState(null);   // предыдущие 30д
  const [market, setMarket] = useState(null); // goldIndexPublicSummary
  const [settings, setSettings] = useState(null);
  const [recent, setRecent] = useState([]); // лента последних договоров
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // ── Дравер деталей сделки ──
  const [drawerDeal, setDrawerDeal] = useState(null);   // { id, ...preview }
  const [drawerDetail, setDrawerDetail] = useState(null); // полные данные с rows
  const [drawerLoading, setDrawerLoading] = useState(false);

  const openDeal = useCallback(async (preview) => {
    setDrawerDeal(preview);
    setDrawerDetail(null);
    setDrawerLoading(true);
    try {
      const { deal } = await api.scrapDealDetail(preview.id);
      setDrawerDetail(deal);
    } catch {
      // показываем preview-данные без rows
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDeal = useCallback(() => {
    setDrawerDeal(null);
    setDrawerDetail(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const today = toIso(new Date());
    const from = addDays(today, -29);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -29);
    const [a, b, m, s, r] = await Promise.allSettled([
      api.analyticsSummary(from, today),
      api.analyticsSummary(prevFrom, prevTo),
      api.goldIndexPublicSummary(),
      api.settings(),
      api.scrapDealsRecent(6),
    ]);
    if (a.status === 'fulfilled') setCur(a.value); else setErr(a.reason?.message || 'Не удалось загрузить сводку');
    if (b.status === 'fulfilled') setPrev(b.value);
    if (m.status === 'fulfilled') setMarket(m.value);
    if (s.status === 'fulfilled') setSettings(s.value);
    if (r.status === 'fulfilled') setRecent(r.value?.deals || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── AI (Grok) ──
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
      const today = toIso(new Date());
      const from = addDays(today, -29);
      const r = await api.aiAsk(question, from, today);
      setAiAnswer(r?.answer || '');
    } catch (e) {
      setAiErr(e?.message || 'AI не ответил, попробуйте ещё раз');
    } finally {
      setAiBusy(false);
    }
  }, [aiQ, aiBusy]);

  const t = cur?.totals;
  const tp = prev?.totals;

  const flowSeries = useMemo(
    () => (cur?.byDay || []).map((x) => ({ x: x.day, sum: Number(x.sumRub) || 0, n: Number(x.count) || 0 })),
    [cur],
  );

  const todayRow = useMemo(() => {
    const today = toIso(new Date());
    return (cur?.byDay || []).find((x) => x.day === today) || null;
  }, [cur]);

  const staff = useMemo(() => {
    if (cur?.viewerScope === 'self') return [];
    const rows = (cur?.byOperator || []).slice().sort((a, b) => (b.sumRub || 0) - (a.sumRub || 0));
    return rows.slice(0, 4);
  }, [cur]);

  // Рынок: наша цена за 1 г 585 пробы vs средняя конкурентов в городе.
  const ourPerGram585 = useMemo(() => {
    if (goldRub == null || !settings) return null;
    const pct = Number(settings.buybackPercentOfScrap);
    if (!Number.isFinite(pct)) return null;
    return goldRub * 0.585 * (pct / 100);
  }, [goldRub, settings]);

  // Прайс по пробам при текущем курсе и проценте выкупа.
  const probeRows = useMemo(() => {
    if (goldRub == null || !settings) return [];
    const pct = Number(settings.buybackPercentOfScrap);
    if (!Number.isFinite(pct)) return [];
    return [375, 500, 585, 750, 916, 999].map((p) => ({
      probe: p,
      v: goldRub * (p / 1000) * (pct / 100),
    }));
  }, [goldRub, settings]);

  const marketRows = useMemo(() => {
    const cities = market?.cities || [];
    return cities.slice(0, 4).map((c) => {
      const avg = c.avgByProbe?.[585];
      const adv = ourPerGram585 != null && Number.isFinite(avg) && avg > 0
        ? ((ourPerGram585 - avg) / avg) * 100
        : null;
      return { id: c.id, name: c.cityName, region: c.regionName, avg: Number.isFinite(avg) ? avg : null, adv, comps: c.competitorsCount };
    });
  }, [market, ourPerGram585]);

  // ── анимированные значения ──
  const goldAnim = useCountUp(goldRub, { duration: 900 });
  const sumAnim = useCountUp(t?.sumRub ?? null, { duration: 1300 });
  const dealsAnim = useCountUp(t?.deals ?? null, { duration: 1100 });
  const clientsAnim = useCountUp(t?.uniqueCustomers ?? null, { duration: 1100 });
  const avgCheck = t && t.deals ? t.sumRub / t.deals : null;
  const avgAnim = useCountUp(avgCheck, { duration: 1300 });
  const avgPrev = tp && tp.deals ? tp.sumRub / tp.deals : null;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Доброе утро';
    if (h >= 12 && h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }, []);

  const userName = useMemo(() => {
    const e = user?.email || '';
    return e.split('@')[0] || 'коллега';
  }, [user]);

  // Ref всегда хранит актуальные данные — без риска устаревшего замыкания.
  const reportDataRef = useRef({});
  reportDataRef.current = {
    userName, price, goldRub, cur, settings, t, tp,
    avgCheck, avgPrev, todayRow, flowSeries, staff, marketRows, probeRows, recent,
  };
  const [reportBusy, setReportBusy] = useState(false);

  async function exportReport() {
    if (reportBusy) return;
    const d = reportDataRef.current;
    const { userName: uName, price: pr, goldRub: gRub,
            cur: cCur, settings: sett, t: tt, tp: ttp,
            avgCheck: avgC, avgPrev: avgP, todayRow: tRow,
            flowSeries: fSeries, staff: stf, marketRows: mRows,
            probeRows: pRows, recent: rec } = d;

    const today = toIso(new Date());
    const from = addDays(today, -29);
    const fmtRu = (iso) => {
      const dd = new Date(`${iso}T00:00:00`);
      return dd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const sourceLabel = pr?.source === 'xaut' ? 'XAUT' : pr?.source === 'moex' ? 'Мосбиржа' : 'ЦБ РФ';
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';

    const payload = {
      theme,
      userName: uName,
      rangeLabel: `${fmtRu(from)} – ${fmtRu(today)}`,
      gold: { value: gRub, source: sourceLabel },
      kpis: {
        sum:     { cur: tt?.sumRub ?? null,         prev: ttp?.sumRub ?? null },
        deals:   { cur: tt?.deals ?? null,           prev: ttp?.deals ?? null },
        clients: { cur: tt?.uniqueCustomers ?? null, prev: ttp?.uniqueCustomers ?? null },
        avg:     { cur: avgC,                        prev: avgP },
      },
      today:  { count: tRow?.count ?? 0, sumRub: Number(tRow?.sumRub) || 0 },
      flow:   fSeries,
      staff:  stf.map((row) => ({
        name: (row.email || '—').split('@')[0],
        sumRub: row.sumRub || 0,
        deals: row.deals || 0,
        share: tt?.sumRub ? Math.round(((row.sumRub || 0) / tt.sumRub) * 100) : 0,
      })),
      market: mRows.map((c) => ({ name: c.name, region: c.region, comps: c.comps, avg: c.avg, adv: c.adv })),
      probes: pRows,
      recent: rec.map((dl) => ({
        name: dl.seller_name,
        contractNo: dl.contract_no,
        probe: dl.first_probe,
        weight: dl.first_weight_gross,
        sum: Number(dl.total_rub) || 0,
        time: fmtDealTime(dl.created_at),
      })),
      buybackPercent: sett?.buybackPercentOfScrap ?? null,
      viewerScope: cCur?.viewerScope,
    };

    setReportBusy(true);
    try {
      const blob = await api.dashboardReportPdf(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-');
      a.download = `dashboard-${date}.pdf`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Не удалось сформировать отчёт: ${e?.message || 'ошибка сервера'}`);
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="dx">
      <PageHint id="dashboard" title="Это ваш рабочий экран">
        Здесь живой курс золота, ключевые показатели за 30 дней и последние договоры. Нажмите на сделку в ленте — откроются детали с фото. Графику можно переключать на свечи и менять таймфрейм.
      </PageHint>
      {/* ── приветствие ── */}
      <div className="dx-head dx-in" style={{ '--d': '0ms' }}>
        <div>
          <h2 className="dx-head__hi">{greeting}, {userName}</h2>
          <p className="dx-head__sub">Сводка по системе за последние 30 дней · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="dx-head__actions">
          <button type="button" className="dx-qa dx-qa--primary" onClick={() => onNavigate?.('calc')}>
            Калькулятор
          </button>
          <button type="button" className="dx-qa" onClick={() => onNavigate?.('contract')}>
            Договор
          </button>
          <button type="button" className="dx-qa dx-qa--pdf" onClick={exportReport} disabled={reportBusy} title="Сформировать PDF-отчёт по дашборду">
            {reportBusy
              ? <><span className="dx-qa-spin" aria-hidden /> Формируем…</>
              : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg> Отчёт PDF</>
            }
          </button>
        </div>
      </div>

      <div className="dx-grid">
        {/* ── живая котировка ── */}
        <section className="dx-card dx-card--quote dx-in" style={{ '--d': '60ms' }}>
          <div className="dx-quote-top">
            <div>
              <div className="dx-label">
                <span className="dx-live-dot" aria-hidden />
                Котировка золота · {price?.source === 'xaut' ? 'XAUT' : price?.source === 'moex' ? 'Мосбиржа' : 'ЦБ РФ'}
              </div>
              <div className="dx-quote-value mono-nums">
                {goldAnim != null ? formatMoney(goldAnim) : '—'}
                <span className="dx-quote-per">/ г</span>
              </div>
              {quoteStats && (
                <div className="dx-quote-stats mono-nums">
                  <span>О <b>{fmtAxis(quoteStats.o)}</b></span>
                  <span>В <b className="dx-quote-stats--h">{fmtAxis(quoteStats.h)}</b></span>
                  <span>Н <b className="dx-quote-stats--l">{fmtAxis(quoteStats.l)}</b></span>
                </div>
              )}
            </div>
            <div className="dx-quote-right">
              <div className="dx-quote-controls">
                <div className="dx-tf" role="tablist" aria-label="Тип графика">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartType === 'area'}
                    className={`dx-tf__btn dx-tf__btn--icon${chartType === 'area' ? ' dx-tf__btn--active' : ''}`}
                    onClick={() => setChartType('area')}
                    title="Линия"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 17l5-6 4 3 6-8 3 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartType === 'candles'}
                    className={`dx-tf__btn dx-tf__btn--icon${chartType === 'candles' ? ' dx-tf__btn--active' : ''}`}
                    onClick={() => setChartType('candles')}
                    title="Свечи"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M8 4v3M8 17v3M16 2v4M16 14v5" />
                      <rect x="5.5" y="7" width="5" height="10" rx="1" />
                      <rect x="13.5" y="6" width="5" height="8" rx="1" />
                    </svg>
                  </button>
                </div>
                <div className="dx-tf" role="tablist" aria-label="Таймфрейм графика">
                  {TIMEFRAMES.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      role="tab"
                      aria-selected={tf === x.key}
                      className={`dx-tf__btn${tf === x.key ? ' dx-tf__btn--active' : ''}`}
                      onClick={() => setTf(x.key)}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dx-quote-delta">
                <DeltaBadge pct={sessionDelta} />
                <span className="dx-quote-session">за период</span>
              </div>
            </div>
          </div>
          <div className="dx-quote-chart">
            {ticks.length > 1 && chartType === 'area' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ticks} margin={{ top: 6, right: 0, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dx-quote-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.38} />
                      <stop offset="70%" stopColor="var(--accent)" stopOpacity={0.06} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--stroke-soft)"
                    strokeOpacity={0.55}
                    strokeDasharray="3 7"
                    vertical={false}
                  />
                  <YAxis
                    domain={tickDomain}
                    orientation="right"
                    width={52}
                    tickCount={5}
                    tick={{ fontSize: 9.5, fill: 'var(--text-dim)' }}
                    tickFormatter={fmtAxis}
                    axisLine={false}
                    tickLine={false}
                  />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 9.5, fill: 'var(--text-dim)' }}
                    tickFormatter={(v) => fmtTickTime(v, tf)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={56}
                    height={20}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--stroke-strong)', strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="dx-tt">
                          <div className="dx-tt__label">{fmtTickTime(p.t, tf)}</div>
                          <div className="dx-tt__val mono-nums">{formatMoney(p.v)}</div>
                        </div>
                      );
                    }}
                  />
                  {goldRub != null && (
                    <ReferenceLine
                      y={goldRub}
                      stroke="var(--accent)"
                      strokeDasharray="2 4"
                      strokeOpacity={0.75}
                      label={{
                        value: fmtAxis(goldRub),
                        position: 'right',
                        fill: 'var(--accent)',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="var(--accent)"
                    strokeWidth={2.2}
                    fill="url(#dx-quote-grad)"
                    isAnimationActive={false}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--bg-panel-solid)', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {candles.length > 1 && chartType === 'candles' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={candles} margin={{ top: 6, right: 0, left: 4, bottom: 0 }}>
                  <CartesianGrid
                    stroke="var(--stroke-soft)"
                    strokeOpacity={0.55}
                    strokeDasharray="3 7"
                    vertical={false}
                  />
                  <YAxis
                    domain={tickDomain}
                    orientation="right"
                    width={52}
                    tickCount={5}
                    tick={{ fontSize: 9.5, fill: 'var(--text-dim)' }}
                    tickFormatter={fmtAxis}
                    axisLine={false}
                    tickLine={false}
                  />
                  {/* Отдельная шкала для объёма: бары занимают нижнюю четверть графика */}
                  <YAxis yAxisId="vol" domain={[0, Math.max(1, maxVol * 4.2)]} hide />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 9.5, fill: 'var(--text-dim)' }}
                    tickFormatter={(v) => fmtTickTime(v, tf)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={56}
                    height={20}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--stroke-soft)', fillOpacity: 0.35 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const p = payload[0].payload;
                      const up = p.c >= p.o;
                      return (
                        <div className="dx-tt">
                          <div className="dx-tt__label">{fmtTickTime(p.t, tf)}</div>
                          <div className="dx-tt__ohlc mono-nums">
                            <span>O {formatMoney(p.o)}</span>
                            <span>H {formatMoney(p.h)}</span>
                            <span>L {formatMoney(p.l)}</span>
                            <span className={up ? 'dx-tt__c--up' : 'dx-tt__c--down'}>C {formatMoney(p.c)}</span>
                          </div>
                          <div className="dx-tt__sub">Объём: {fmtAxis(p.vol)}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar yAxisId="vol" dataKey="vol" isAnimationActive={false} barSize={7} radius={[2, 2, 0, 0]}>
                    {candles.map((c) => (
                      <Cell key={c.i} fill={c.c >= c.o ? 'var(--emerald)' : 'var(--crimson)'} fillOpacity={0.22} />
                    ))}
                  </Bar>
                  {goldRub != null && (
                    <ReferenceLine
                      y={goldRub}
                      stroke="var(--accent)"
                      strokeDasharray="2 4"
                      strokeOpacity={0.75}
                      label={{
                        value: fmtAxis(goldRub),
                        position: 'right',
                        fill: 'var(--accent)',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Bar
                    dataKey={(d) => [d.l, d.h]}
                    shape={<CandleShape />}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* ── сегодня ── */}
        <section className="dx-card dx-card--today dx-in" style={{ '--d': '120ms' }}>
          <div className="dx-label">Сегодня</div>
          <div className="dx-today-stats">
            <div className="dx-today-stat">
              <span className="dx-today-stat__v mono-nums">{todayRow?.count ?? 0}</span>
              <span className="dx-today-stat__k">сделок</span>
            </div>
            <div className="dx-today-stat">
              <span className="dx-today-stat__v mono-nums">{formatMoney(Number(todayRow?.sumRub) || 0)}</span>
              <span className="dx-today-stat__k">оборот</span>
            </div>
          </div>
          <div className="dx-today-actions">
            <button type="button" className="dx-mini-action" onClick={() => onNavigate?.('clients')}>
              <span>Клиенты</span> <span aria-hidden>→</span>
            </button>
            <button type="button" className="dx-mini-action" onClick={() => onNavigate?.('analytics')}>
              <span>Аналитика</span> <span aria-hidden>→</span>
            </button>
          </div>
        </section>

        {/* ── строка AI Grok ── */}
        <section className="dx-card dx-card--ai dx-in" style={{ '--d': '150ms' }}>
          <div className="dx-ai-head">
            <span className="dx-ai-badge" aria-hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" opacity="0.7" />
              </svg>
            </span>
            <div className="dx-ai-head-text">
              <h3 className="dx-card-title">AI-аналитик Grok</h3>
              <p className="dx-card-sub">Вопросы и прогнозы по вашим данным за 30 дней</p>
            </div>
          </div>
          <form
            className="dx-ai-row"
            onSubmit={(e) => { e.preventDefault(); askAi(); }}
          >
            <input
              className="dx-ai-input"
              type="text"
              value={aiQ}
              onChange={(e) => setAiQ(e.target.value)}
              placeholder="Например: как прошли последние 30 дней и что улучшить?"
              maxLength={600}
              disabled={aiBusy}
            />
            <button type="submit" className="dx-ai-send" disabled={aiBusy || !aiQ.trim()}>
              {aiBusy ? 'Думает…' : 'Спросить'}
            </button>
          </form>
          <div className="dx-ai-chips">
            {AI_SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="dx-ai-chip" onClick={() => askAi(s)} disabled={aiBusy}>
                {s}
              </button>
            ))}
          </div>
          {(aiBusy || aiAnswer || aiErr) && (
            <div className="dx-ai-result">
              {aiBusy && (
                <div className="dx-ai-thinking">
                  Grok анализирует данные
                  <span className="dx-ai-dot" /><span className="dx-ai-dot" /><span className="dx-ai-dot" />
                </div>
              )}
              {!aiBusy && aiErr && <div className="dx-ai-err">{aiErr}</div>}
              {!aiBusy && !aiErr && aiAnswer && <div className="dx-ai-answer">{aiAnswer}</div>}
            </div>
          )}
        </section>

        {/* ── KPI ── */}
        <section className="dx-kpi dx-card dx-in" style={{ '--d': '180ms' }}>
          <div className="dx-kpi__top">
            <span className="dx-kpi__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="14" rx="3" />
                <path d="M2 10h20" />
                <path d="M6 15h4" />
              </svg>
            </span>
            <div className="dx-label">Оборот, 30 дней</div>
          </div>
          <div className="dx-kpi__v mono-nums">{loading ? '…' : sumAnim != null ? formatMoney(sumAnim) : '—'}</div>
          <div className="dx-kpi__foot">
            <DeltaBadge pct={deltaPct(t?.sumRub, tp?.sumRub)} />
            <span className="dx-kpi__prev">пред.: {tp?.sumRub != null ? formatMoney(tp.sumRub) : '—'}</span>
          </div>
          {flowSeries.length > 1 && (
            <div className="dx-kpi__spark" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={flowSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dx-spark-sum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="sum" stroke="var(--accent)" strokeWidth={1.6} fill="url(#dx-spark-sum)" dot={false} animationDuration={1400} animationBegin={650} animationEasing="ease" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="dx-kpi dx-card dx-in" style={{ '--d': '230ms' }}>
          <div className="dx-kpi__top">
            <span className="dx-kpi__icon dx-kpi__icon--emerald" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
              </svg>
            </span>
            <div className="dx-label">Сделок</div>
          </div>
          <div className="dx-kpi__v mono-nums">{loading ? '…' : dealsAnim ?? '—'}</div>
          <div className="dx-kpi__foot">
            <DeltaBadge pct={deltaPct(t?.deals, tp?.deals)} />
            <span className="dx-kpi__prev">пред.: {tp?.deals ?? '—'}</span>
          </div>
          {flowSeries.length > 1 && (
            <div className="dx-kpi__spark" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={flowSeries} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dx-spark-n" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--emerald)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--emerald)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="n" stroke="var(--emerald)" strokeWidth={1.6} fill="url(#dx-spark-n)" dot={false} animationDuration={1400} animationBegin={750} animationEasing="ease" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="dx-kpi dx-card dx-in" style={{ '--d': '280ms' }}>
          <div className="dx-kpi__top">
            <span className="dx-kpi__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="3.5" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div className="dx-label">Клиентов</div>
          </div>
          <div className="dx-kpi__v mono-nums">{loading ? '…' : clientsAnim ?? '—'}</div>
          <div className="dx-kpi__foot">
            <DeltaBadge pct={deltaPct(t?.uniqueCustomers, tp?.uniqueCustomers)} />
            <span className="dx-kpi__prev">пред.: {tp?.uniqueCustomers ?? '—'}</span>
          </div>
        </section>
        <section className="dx-kpi dx-card dx-in" style={{ '--d': '330ms' }}>
          <div className="dx-kpi__top">
            <span className="dx-kpi__icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4.5" />
                <circle cx="12" cy="12" r="0.5" fill="currentColor" />
              </svg>
            </span>
            <div className="dx-label">Средний чек</div>
          </div>
          <div className="dx-kpi__v mono-nums">{loading ? '…' : avgAnim != null ? formatMoney(Math.round(avgAnim)) : '—'}</div>
          <div className="dx-kpi__foot">
            <DeltaBadge pct={deltaPct(avgCheck, avgPrev)} />
            <span className="dx-kpi__prev">пред.: {avgPrev != null ? formatMoney(Math.round(avgPrev)) : '—'}</span>
          </div>
        </section>

        {/* ── денежный поток ── */}
        <section className="dx-card dx-card--flow dx-in" style={{ '--d': '380ms' }}>
          <div className="dx-card-head">
            <div>
              <h3 className="dx-card-title">Денежный поток</h3>
              <p className="dx-card-sub">Оборот по дням за 30 дней</p>
            </div>
            <button type="button" className="dx-link" onClick={() => onNavigate?.('analytics')}>
              Вся аналитика →
            </button>
          </div>
          <div className="dx-flow-chart">
            {flowSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={flowSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dx-flow-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="70%" stopColor="var(--accent)" stopOpacity={0.07} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} minTickGap={28} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : v)} axisLine={false} tickLine={false} width={42} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.[0]) return null;
                      const p = payload[0].payload;
                      return (
                        <div className="dx-tt">
                          <div className="dx-tt__label">{label}</div>
                          <div className="dx-tt__val mono-nums">{formatMoney(p.sum)}</div>
                          <div className="dx-tt__sub">сделок: {p.n}</div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sum"
                    stroke="var(--accent)"
                    strokeWidth={2.4}
                    fill="url(#dx-flow-grad)"
                    activeDot={{ r: 4.5, fill: 'var(--accent)', stroke: 'var(--bg-panel-solid)', strokeWidth: 2 }}
                    animationDuration={1900}
                    animationEasing="ease"
                    animationBegin={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="dx-empty">{loading ? 'Загружаем…' : 'Нет данных за период'}</div>
            )}
          </div>
        </section>

        {/* ── сотрудники ── */}
        <section className="dx-card dx-card--staff dx-in" style={{ '--d': '440ms' }}>
          <div className="dx-card-head">
            <div>
              <h3 className="dx-card-title">Команда</h3>
              <p className="dx-card-sub">Топ по обороту за 30 дней</p>
            </div>
          </div>
          {staff.length > 0 ? (
            <div className="dx-staff">
              {staff.map((row, i) => {
                const share = t?.sumRub ? Math.round(((row.sumRub || 0) / t.sumRub) * 100) : 0;
                return (
                  <div key={row.operatorId ?? i} className="dx-staff-row">
                    <span className="dx-staff-rank mono-nums">{i + 1}</span>
                    <div className="dx-staff-mid">
                      <span className="dx-staff-name">{(row.email || '—').split('@')[0]}</span>
                      <div className="dx-staff-bar"><div className="dx-staff-bar__fill" style={{ width: `${Math.max(3, share)}%` }} /></div>
                    </div>
                    <div className="dx-staff-right">
                      <span className="dx-staff-sum mono-nums">{formatMoney(row.sumRub || 0)}</span>
                      <span className="dx-staff-deals">{row.deals} сд. · {share}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dx-empty">{loading ? 'Загружаем…' : cur?.viewerScope === 'self' ? 'Доступна только своя статистика' : 'Нет данных'}</div>
          )}
        </section>

        {/* ── последние договоры ── */}
        <section className="dx-card dx-card--deals dx-in" style={{ '--d': '500ms' }}>
          <div className="dx-card-head">
            <div>
              <h3 className="dx-card-title">Последние договоры</h3>
              <p className="dx-card-sub">Свежие сделки по системе</p>
            </div>
            <button type="button" className="dx-link" onClick={() => onNavigate?.('clients')}>
              Все клиенты →
            </button>
          </div>
          {recent.length > 0 ? (
            <div className="dx-deals">
              {recent.map((d) => (
                <button key={d.id} type="button" className="dx-deal" onClick={() => openDeal(d)}>
                  <span className="dx-deal__avatar" aria-hidden>
                    {(d.seller_name || '?').trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="dx-deal__mid">
                    <span className="dx-deal__name">{d.seller_name || 'Без имени'}</span>
                    <span className="dx-deal__meta">
                      {d.contract_no ? `№ ${d.contract_no}` : 'Договор'}
                      {d.first_probe ? ` · ${d.first_probe} пр.` : ''}
                      {d.first_weight_gross ? ` · ${d.first_weight_gross} г` : ''}
                    </span>
                  </div>
                  <div className="dx-deal__right">
                    <span className="dx-deal__sum mono-nums">{formatMoney(Number(d.total_rub) || 0)}</span>
                    <span className="dx-deal__time">{fmtDealTime(d.created_at)}</span>
                  </div>
                  <svg className="dx-deal__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          ) : (
            <div className="dx-empty">{loading ? 'Загружаем…' : 'Сделок пока нет — оформите первый договор'}</div>
          )}
        </section>

        {/* ── рынок ── */}
        <section className="dx-card dx-card--market dx-in" style={{ '--d': '560ms' }}>
          <div className="dx-card-head">
            <div>
              <h3 className="dx-card-title">Рынок · 585 проба</h3>
              <p className="dx-card-sub">
                Наша цена {ourPerGram585 != null ? `${formatMoney(Math.round(ourPerGram585))}/г` : '—'} против средней конкурентов
              </p>
            </div>
          </div>
          {marketRows.length > 0 ? (
            <div className="dx-market">
              {marketRows.map((c) => (
                <div key={c.id} className="dx-market-row">
                  <div className="dx-market-city">
                    <span className="dx-market-name">{c.name}</span>
                    <span className="dx-market-region">{c.region} · {c.comps} конк.</span>
                  </div>
                  <span className="dx-market-avg mono-nums">{c.avg != null ? formatMoney(Math.round(c.avg)) : '—'}</span>
                  {c.adv != null ? (
                    <span className={`dx-market-adv ${c.adv >= 0 ? 'dx-market-adv--good' : 'dx-market-adv--bad'}`}>
                      {c.adv >= 0 ? '+' : ''}{c.adv.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="dx-market-adv dx-market-adv--na">—</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="dx-empty">{loading ? 'Загружаем…' : 'Добавьте города в «Индекс золота»'}</div>
          )}
        </section>

        {/* ── выкуп по пробам ── */}
        <section className="dx-card dx-card--probes dx-in" style={{ '--d': '620ms' }}>
          <div className="dx-card-head">
            <div>
              <h3 className="dx-card-title">Выкуп по пробам</h3>
              <p className="dx-card-sub">
                За грамм при курсе {goldRub != null ? formatMoney(goldRub) : '—'}
                {settings?.buybackPercentOfScrap != null ? ` и политике ${settings.buybackPercentOfScrap}%` : ''}
              </p>
            </div>
            <button type="button" className="dx-link" onClick={() => onNavigate?.('calc')}>
              Рассчитать →
            </button>
          </div>
          {probeRows.length > 0 ? (
            <div className="dx-probes">
              {probeRows.map((p) => (
                <div key={p.probe} className={`dx-probe${p.probe === 585 ? ' dx-probe--hot' : ''}`}>
                  <span className="dx-probe__name">{p.probe}</span>
                  <span className="dx-probe__price mono-nums">{formatMoney(Math.round(p.v))}</span>
                  <div className="dx-probe__bar">
                    <div className="dx-probe__bar-fill" style={{ width: `${Math.round((p.probe / 999) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dx-empty">{loading ? 'Загружаем…' : 'Нет данных о курсе'}</div>
          )}
        </section>
      </div>

      {err && !loading && <p className="dx-err">{err}</p>}

      {/* ── дравер: детали сделки ── */}
      {drawerDeal && (
        <div className="dd-overlay" onClick={closeDeal} aria-modal="true" role="dialog">
          <div className="dd-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dd-header">
              <div className="dd-header__main">
                <span className="dd-avatar">{(drawerDeal.seller_name || '?').trim().slice(0, 1).toUpperCase()}</span>
                <div>
                  <div className="dd-seller">{drawerDeal.seller_name || 'Без имени'}</div>
                  <div className="dd-meta">
                    {drawerDeal.contract_no ? `Договор № ${drawerDeal.contract_no}` : 'Договор'}
                    {drawerDeal.created_at && ` · ${new Date(drawerDeal.created_at).toLocaleDateString('ru-RU')}`}
                  </div>
                </div>
              </div>
              <button type="button" className="dd-close" onClick={closeDeal} aria-label="Закрыть">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="dd-total">
              <span className="dd-total__label">Итого к выплате</span>
              <span className="dd-total__value mono-nums">{formatMoney(Number(drawerDeal.total_rub) || 0)}</span>
            </div>

            {drawerLoading && <div className="dd-loading">Загружаем детали…</div>}

            {!drawerLoading && drawerDetail && (
              <>
                {drawerDetail.phone && (
                  <div className="dd-info-row"><span className="dd-info-k">Телефон</span><span className="dd-info-v">{drawerDetail.phone}</span></div>
                )}
                {drawerDetail.appraiser_name && (
                  <div className="dd-info-row"><span className="dd-info-k">Оценщик</span><span className="dd-info-v">{drawerDetail.appraiser_name}</span></div>
                )}

                {Array.isArray(drawerDetail.rows) && drawerDetail.rows.filter(r => r.itemName || r.weightGross || r.priceRub).length > 0 && (
                  <div className="dd-positions">
                    <div className="dd-positions__title">Позиции</div>
                    {drawerDetail.rows.filter(r => r.itemName || r.weightGross || r.priceRub).map((r, i) => (
                      <div key={i} className="dd-position">
                        {r.photoUrl && (
                          <img src={r.photoUrl} alt="Фото изделия" className="dd-position__photo" />
                        )}
                        <div className="dd-position__body">
                          <div className="dd-position__name">{r.itemName || 'Позиция'}</div>
                          <div className="dd-position__props">
                            {r.metal && <span>{r.metal}</span>}
                            {r.probe && <span>{r.probe} пр.</span>}
                            {r.weightGross && <span>{r.weightGross} г лом</span>}
                            {r.weightNet && <span>{r.weightNet} г чист.</span>}
                          </div>
                        </div>
                        {r.priceRub && (
                          <div className="dd-position__price mono-nums">{formatMoney(Number(r.priceRub) || 0)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="dd-actions">
              <button type="button" className="dd-btn-pdf" onClick={async () => {
                try {
                  const blob = await api.scrapDealPdf(drawerDeal.id);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `dogovor-${drawerDeal.contract_no || drawerDeal.id.slice(0,8)}.pdf`;
                  a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
                  URL.revokeObjectURL(url);
                } catch {}
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
                Скачать PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* ─── Dashboard (Stage 7) ─────────────────────────────────────────────────── */
.dx { display: flex; flex-direction: column; gap: 18px; position: relative; }

/* Мягкие световые пятна за сеткой — глубина как на референсе */
.dx::before,
.dx::after {
  content: '';
  position: absolute;
  pointer-events: none;
  z-index: -1;
  border-radius: 50%;
  filter: blur(70px);
}
.dx::before {
  top: -140px; left: -8%;
  width: 46%; height: 380px;
  background: radial-gradient(ellipse at center, var(--accent-soft), transparent 70%);
  opacity: 0.7;
}
.dx::after {
  top: 240px; right: -10%;
  width: 38%; height: 320px;
  background: radial-gradient(ellipse at center, var(--emerald-soft), transparent 70%);
  opacity: 0.5;
}

/* Появление: одна анимация на все блоки, каскад через --d.
   Только opacity + transform → композитится на GPU, без репейнтов и рывков.
   keyframes dxIn определён глобально в index.css (без filter: blur). */
.dx-in {
  animation: dxIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--d, 0ms);
  will-change: transform, opacity;
  backface-visibility: hidden;
}

/* ── head ── */
.dx-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}
.dx-head__hi {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 1.1rem + 1.4vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}
.dx-head__sub { margin: 4px 0 0; font-size: 0.86rem; color: var(--text-muted); }
.dx-head__actions { display: flex; gap: 8px; }
.dx-qa {
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid var(--stroke);
  background: var(--surface);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.15s, box-shadow 0.2s;
}
.dx-qa:hover { border-color: var(--stroke-strong); transform: translateY(-1px); }
.dx-qa--primary {
  background: var(--accent-grad);
  color: #fff;
  border: none;
  box-shadow: 0 4px 18px var(--accent-glow);
}
.dx-qa--primary:hover { filter: brightness(1.07); transform: translateY(-1px); }
.dx-qa--pdf { display: inline-flex; align-items: center; gap: 7px; }
.dx-qa--pdf:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.dx-qa--pdf:disabled { opacity: 0.65; cursor: not-allowed; }
.dx-qa-spin {
  display: inline-block; width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--stroke-strong); border-top-color: var(--accent);
  animation: dxSpin 0.7s linear infinite; flex-shrink: 0;
}
@keyframes dxSpin { to { transform: rotate(360deg); } }

/* ── grid ── */
.dx-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 14px;
}
.dx-card {
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: var(--shadow-card);
  min-width: 0;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 280ms cubic-bezier(0.22, 1, 0.36, 1), border-color 220ms;
}
/* В тёмной теме — лёгкий градиент сверху и внутренняя «кромка» света */
:root[data-theme='dark'] .dx-card {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0) 36%),
    var(--bg-panel-solid);
  box-shadow: var(--shadow-card), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.dx-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-pop);
  border-color: var(--stroke);
}
:root[data-theme='dark'] .dx-card:hover {
  box-shadow: var(--shadow-pop), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dx-card--quote { grid-column: span 8; display: flex; flex-direction: column; gap: 6px; min-height: 260px; position: relative; overflow: hidden; }
/* Светящееся пятно в углу карточки котировки */
.dx-card--quote::before {
  content: '';
  position: absolute;
  top: -55%; right: -18%;
  width: 64%; height: 130%;
  background: radial-gradient(circle, var(--accent-soft), transparent 62%);
  opacity: 0.75;
  pointer-events: none;
}
.dx-card--quote > * { position: relative; }

/* «Сегодня» — акцентная панель с градиентом, как промо-карта на референсе */
.dx-card--today {
  grid-column: span 4;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(168deg, color-mix(in srgb, var(--accent) 16%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 62%);
  border-color: color-mix(in srgb, var(--accent) 26%, var(--stroke-soft));
}
:root[data-theme='dark'] .dx-card--today {
  background:
    linear-gradient(168deg, color-mix(in srgb, var(--accent) 22%, var(--bg-panel-solid)) 0%, var(--bg-panel-solid) 64%),
    var(--bg-panel-solid);
}
.dx-card--today::before {
  content: '';
  position: absolute;
  top: -45%; right: -25%;
  width: 80%; height: 100%;
  background: radial-gradient(circle, var(--accent-soft), transparent 64%);
  opacity: 0.8;
  pointer-events: none;
}
.dx-card--today > * { position: relative; }
.dx-card--today .dx-label { color: color-mix(in srgb, var(--accent) 55%, var(--text-muted)); }
.dx-kpi { grid-column: span 3; display: flex; flex-direction: column; }
.dx-card--ai { grid-column: span 12; }
.dx-card--flow { grid-column: span 8; }
.dx-card--staff { grid-column: span 4; }
.dx-card--deals { grid-column: span 7; }
.dx-card--market { grid-column: span 5; }
.dx-card--probes { grid-column: span 12; }

/* ── labels ── */
.dx-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 7px;
}
.dx-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.dx-card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-strong);
}
.dx-card-sub { margin: 3px 0 0; font-size: 0.78rem; color: var(--text-muted); }
.dx-link {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s;
  white-space: nowrap;
}
.dx-link:hover { background: var(--accent-soft); }

/* ── котировка ── */
.dx-quote-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.dx-live-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--emerald);
  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.55);
  animation: dxPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  flex-shrink: 0;
}
@keyframes dxPulse {
  0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(74, 222, 128, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
}
.dx-quote-value {
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 1.4rem + 2vw, 2.8rem);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text-strong);
  line-height: 1.05;
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.dx-quote-per { font-size: 0.95rem; color: var(--text-muted); font-weight: 500; }
.dx-quote-stats {
  display: flex;
  gap: 14px;
  margin-top: 7px;
  font-size: 0.72rem;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.dx-quote-stats b { font-weight: 600; color: var(--text-muted); }
.dx-quote-stats b.dx-quote-stats--h { color: var(--emerald); }
.dx-quote-stats b.dx-quote-stats--l { color: var(--crimson); }
.dx-quote-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.dx-quote-controls { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.dx-quote-delta { display: flex; align-items: center; gap: 6px; }
.dx-quote-session { font-size: 0.68rem; color: var(--text-dim); }

/* переключатель таймфрейма */
.dx-tf {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 9px;
  background: var(--stroke-soft);
  border: 1px solid var(--stroke-soft);
}
.dx-tf__btn {
  padding: 4px 9px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
  font-variant-numeric: tabular-nums;
}
.dx-tf__btn:hover:not(.dx-tf__btn--active) { color: var(--text); }
.dx-tf__btn--active {
  background: var(--bg-panel-solid);
  color: var(--text-strong);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.dx-tf__btn--icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
}
.dx-quote-chart {
  flex: 1;
  min-height: 130px;
  margin: 4px -12px -10px;
}
/* Свечение линии котировки и денежного потока — как на референсе */
.dx-quote-chart .recharts-area-curve,
.dx-flow-chart .recharts-area-curve {
  filter: drop-shadow(0 0 6px var(--accent-glow));
}

/* ── дельта ── */
.dx-delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 7px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dx-delta--up { color: var(--emerald); background: var(--emerald-soft); }
.dx-delta--down { color: var(--crimson); background: var(--crimson-soft); }
.dx-delta--na { color: var(--text-dim); background: var(--stroke-soft); }

/* ── сегодня ── */
.dx-today-stats { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.dx-today-stat { display: flex; flex-direction: column; }
.dx-today-stat__v {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  line-height: 1.1;
}
.dx-today-stat__k { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }
.dx-today-actions { display: flex; flex-direction: column; gap: 6px; }
.dx-mini-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 9px 13px;
  border-radius: 9px;
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, padding 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.dx-mini-action:hover { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
/* В акцентной карточке «Сегодня» кнопки — полупрозрачное стекло */
.dx-card--today .dx-mini-action {
  background: color-mix(in srgb, var(--bg-panel-solid) 58%, transparent);
  border-color: color-mix(in srgb, var(--accent) 22%, var(--stroke-soft));
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
}
.dx-card--today .dx-mini-action:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--bg-panel-solid) 78%, transparent);
}

/* ── KPI ── */
.dx-kpi__top { display: flex; align-items: center; gap: 9px; }
.dx-kpi__icon {
  width: 27px; height: 27px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
}
.dx-kpi__icon--emerald {
  background: var(--emerald-soft);
  color: var(--emerald);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--emerald) 18%, transparent);
}
.dx-kpi__v {
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 1.1rem + 1vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-strong);
  line-height: 1.1;
  margin: 8px 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dx-kpi__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dx-kpi__prev { font-size: 0.7rem; color: var(--text-dim); }
.dx-kpi__spark {
  height: 36px;
  margin: 10px -10px -8px;
  opacity: 0.9;
  pointer-events: none;
}

/* ── flow chart ── */
.dx-flow-chart { height: 230px; }

/* tooltip */
.dx-tt {
  background: var(--bg-elevated);
  border: 1px solid var(--stroke);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 9px 13px;
  font-size: 0.8rem;
}
.dx-tt__label { color: var(--text-muted); font-size: 0.7rem; margin-bottom: 3px; }
.dx-tt__val { color: var(--text-strong); font-weight: 700; font-size: 0.92rem; }
.dx-tt__sub { color: var(--text-muted); font-size: 0.72rem; margin-top: 2px; }
.dx-tt__ohlc {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 12px;
  font-size: 0.74rem;
  color: var(--text);
  font-weight: 600;
}
.dx-tt__c--up { color: var(--emerald); }
.dx-tt__c--down { color: var(--crimson); }

/* ── staff ── */
.dx-staff { display: flex; flex-direction: column; gap: 12px; }
.dx-staff-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dx-staff-rank {
  width: 24px; height: 24px;
  border-radius: 7px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.74rem;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.dx-staff-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dx-staff-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dx-staff-bar { height: 4px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.dx-staff-bar__fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent-grad);
  transform-origin: left;
  animation: dxBarIn 900ms cubic-bezier(0.22, 1, 0.36, 1) 600ms both;
}
@keyframes dxBarIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.dx-staff-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.dx-staff-sum { font-size: 0.8rem; font-weight: 700; color: var(--text-strong); }
.dx-staff-deals { font-size: 0.68rem; color: var(--text-dim); }

/* ── market ── */
.dx-market { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.dx-market-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  min-width: 0;
}
.dx-market-city { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dx-market-name { font-size: 0.86rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-market-region { font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-market-avg { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.dx-market-adv {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 7px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dx-market-adv--good { color: var(--emerald); background: var(--emerald-soft); }
.dx-market-adv--bad { color: var(--crimson); background: var(--crimson-soft); }
.dx-market-adv--na { color: var(--text-dim); background: var(--stroke-soft); }

/* ── AI Grok ── */
.dx-card--ai {
  border: 1px solid transparent;
  background:
    linear-gradient(var(--bg-panel-solid), var(--bg-panel-solid)) padding-box,
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 45%, var(--stroke-soft)), var(--stroke-soft) 38%, var(--stroke-soft) 62%, color-mix(in srgb, var(--accent) 30%, var(--stroke-soft))) border-box;
}
:root[data-theme='dark'] .dx-card--ai {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0) 40%) padding-box,
    linear-gradient(var(--bg-panel-solid), var(--bg-panel-solid)) padding-box,
    linear-gradient(120deg, color-mix(in srgb, var(--accent) 55%, var(--stroke-soft)), var(--stroke-soft) 38%, var(--stroke-soft) 62%, color-mix(in srgb, var(--accent) 38%, var(--stroke-soft))) border-box;
}
.dx-ai-head { display: flex; align-items: center; gap: 11px; margin-bottom: 13px; }
.dx-ai-badge {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: var(--accent-grad);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.dx-ai-row { display: flex; gap: 8px; }
.dx-ai-input {
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
.dx-ai-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.dx-ai-input::placeholder { color: var(--text-dim); }
.dx-ai-send {
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
.dx-ai-send:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.dx-ai-send:disabled { opacity: 0.55; cursor: not-allowed; }
.dx-ai-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
.dx-ai-chip {
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
.dx-ai-chip:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.dx-ai-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.dx-ai-result {
  margin-top: 13px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--stroke-soft);
  animation: dxAiIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes dxAiIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.dx-ai-thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.84rem;
  color: var(--text-muted);
}
.dx-ai-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--accent);
  animation: dxAiDot 1.2s ease-in-out infinite;
}
.dx-ai-dot:nth-child(2) { animation-delay: 0.15s; }
.dx-ai-dot:nth-child(3) { animation-delay: 0.3s; }
.dx-ai-dot:first-of-type { margin-left: 6px; }
@keyframes dxAiDot {
  0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
.dx-ai-answer {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
}
.dx-ai-err { font-size: 0.84rem; color: var(--crimson); }

/* ── последние договоры ── */
.dx-deals { display: flex; flex-direction: column; }
.dx-deal {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 6px; min-width: 0; width: 100%;
  border: none; background: transparent; text-align: left; cursor: pointer;
  border-bottom: 1px solid var(--stroke-soft);
  border-radius: 10px;
  transition: background 160ms, transform 160ms;
}
.dx-deal:last-child { border-bottom: none; }
.dx-deal:hover { background: var(--surface); transform: translateX(2px); }
.dx-deal__avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.82rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dx-deal__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dx-deal__name { font-size: 0.84rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-deal__meta { font-size: 0.7rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-deal__right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.dx-deal__sum { font-size: 0.84rem; font-weight: 700; color: var(--text-strong); }
.dx-deal__time { font-size: 0.68rem; color: var(--text-dim); }
.dx-deal__chevron { color: var(--text-dim); flex-shrink: 0; transition: transform 160ms; }
.dx-deal:hover .dx-deal__chevron { transform: translateX(2px); color: var(--accent); }

/* ── Deal Drawer ── */
.dd-overlay {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
  display: flex; align-items: flex-end; justify-content: flex-end;
  animation: ddFadeIn 240ms ease both;
}
@media (min-width: 600px) { .dd-overlay { align-items: center; } }
@keyframes ddFadeIn { from { opacity: 0; } }
.dd-drawer {
  width: 100%; max-width: 480px; max-height: 90dvh;
  overflow-y: auto; overflow-x: hidden;
  background: var(--bg-panel-solid);
  border: 1px solid var(--stroke-soft);
  border-radius: 22px 22px 0 0;
  padding: 24px 20px 32px;
  display: flex; flex-direction: column; gap: 16px;
  box-shadow: 0 -12px 60px rgba(0,0,0,0.3);
  animation: ddSlideUp 360ms cubic-bezier(0.22,1,0.36,1) both;
}
@media (min-width: 600px) {
  .dd-drawer { border-radius: 22px; box-shadow: var(--shadow-pop); animation: ddSlideIn 360ms cubic-bezier(0.22,1,0.36,1) both; }
}
@keyframes ddSlideUp { from { transform: translateY(100%); opacity: 0; } }
@keyframes ddSlideIn { from { transform: translateX(60px) scale(0.96); opacity: 0; } }
.dd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dd-header__main { display: flex; align-items: center; gap: 12px; }
.dd-avatar {
  width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent-soft); color: var(--accent);
  font-size: 1.1rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.dd-seller { font-size: 1.05rem; font-weight: 700; color: var(--text-strong); }
.dd-meta { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
.dd-close {
  flex-shrink: 0; border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
  color: var(--text-muted); border-radius: 10px; padding: 6px; cursor: pointer;
  display: flex; align-items: center; transition: color 160ms, background 160ms;
}
.dd-close:hover { background: var(--crimson-soft); color: var(--crimson); border-color: var(--crimson); }
.dd-total {
  display: flex; justify-content: space-between; align-items: center;
  background: linear-gradient(120deg, var(--emerald) 0%, color-mix(in srgb, var(--emerald) 75%, #000) 100%);
  border-radius: 16px; padding: 16px 18px; color: #fff;
}
.dd-total__label { font-size: 0.8rem; font-weight: 600; opacity: 0.85; }
.dd-total__value { font-size: 1.4rem; font-weight: 800; letter-spacing: -0.03em; font-family: var(--font-display); }
.dd-loading { font-size: 0.85rem; color: var(--text-muted); padding: 8px 0; }
.dd-info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--stroke-soft); }
.dd-info-row:last-of-type { border: none; }
.dd-info-k { font-size: 0.8rem; color: var(--text-muted); }
.dd-info-v { font-size: 0.85rem; font-weight: 600; }
.dd-positions { display: flex; flex-direction: column; gap: 10px; }
.dd-positions__title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
.dd-position {
  display: flex; align-items: flex-start; gap: 12px;
  border: 1px solid var(--stroke-soft); border-radius: 14px; padding: 12px 14px;
  background: var(--bg-elevated);
}
.dd-position__photo {
  width: 60px; height: 60px; border-radius: 10px; object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--stroke-soft);
}
.dd-position__body { flex: 1; min-width: 0; }
.dd-position__name { font-size: 0.88rem; font-weight: 600; margin-bottom: 4px; }
.dd-position__props { display: flex; flex-wrap: wrap; gap: 4px 8px; }
.dd-position__props span { font-size: 0.72rem; background: var(--surface); border: 1px solid var(--stroke-soft); border-radius: 6px; padding: 2px 7px; color: var(--text-muted); }
.dd-position__price { font-size: 0.9rem; font-weight: 700; color: var(--accent); flex-shrink: 0; align-self: center; font-family: var(--font-display); }
.dd-actions { margin-top: 4px; }
.dd-btn-pdf {
  display: flex; align-items: center; gap: 8px; justify-content: center;
  width: 100%; padding: 14px; border-radius: 14px;
  border: 1.5px solid var(--stroke-soft); background: var(--bg-elevated);
  color: var(--text); font-size: 0.9rem; font-weight: 600; cursor: pointer;
  transition: all 200ms;
}
.dd-btn-pdf:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }

/* ── пробы ── */
.dx-probes {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.dx-probe {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid var(--stroke-soft);
  background: var(--surface);
  min-width: 0;
  transition: border-color 0.18s, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.dx-probe:hover { border-color: var(--stroke-strong); transform: translateY(-1px); }
.dx-probe--hot { border-color: var(--accent); }
.dx-probe--hot .dx-probe__name { color: var(--accent); }
.dx-probe__name {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}
.dx-probe__price {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dx-probe__bar { height: 3px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.dx-probe__bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent-grad);
  transform-origin: left;
  animation: dxBarIn 800ms cubic-bezier(0.22, 1, 0.36, 1) 700ms both;
}

.dx-empty {
  padding: 22px 10px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--text-dim);
}
.dx-err { margin: 0; font-size: 0.84rem; color: var(--danger); }

/* ── tablet ── */
@media (max-width: 1100px) {
  .dx-card--quote { grid-column: span 12; }
  .dx-card--today { grid-column: span 12; }
  .dx-kpi { grid-column: span 6; }
  .dx-card--flow { grid-column: span 12; }
  .dx-card--staff { grid-column: span 12; }
  .dx-card--deals { grid-column: span 12; }
  .dx-card--probes { grid-column: span 12; }
  .dx-card--market { grid-column: span 12; }
  .dx-probes { grid-template-columns: repeat(3, 1fr); }
  .dx-today-stats { flex-direction: row; gap: 26px; }
  .dx-today-actions { flex-direction: row; }
  .dx-mini-action { flex: 1; }
}

/* ── mobile ── */
@media (max-width: 640px) {
  .dx { gap: 14px; }
  .dx-grid { gap: 10px; }
  .dx-card { padding: 15px 16px; border-radius: 15px; }
  .dx-kpi { grid-column: span 6; }
  .dx-kpi__v { font-size: 1.3rem; }
  .dx-card--quote { min-height: 200px; }
  .dx-quote-top { flex-direction: column; }
  .dx-quote-right { flex-direction: row; align-items: center; justify-content: space-between; width: 100%; }
  .dx-quote-chart { min-height: 100px; margin: 4px -10px -8px; }
  .dx-flow-chart { height: 190px; }
  .dx-head__actions { width: 100%; }
  .dx-qa { flex: 1; text-align: center; }
  .dx-market { grid-template-columns: 1fr; }
  .dx-probes { grid-template-columns: repeat(2, 1fr); }
  .dx-ai-row { flex-direction: column; }
  .dx-ai-send { padding: 11px 20px; }
}
@media (max-width: 380px) {
  .dx-kpi { grid-column: span 12; }
}

@media (prefers-reduced-motion: reduce) {
  .dx-in, .dx-staff-bar__fill, .dx-live-dot { animation: none !important; }
  .dx-card, .dx-qa, .dx-mini-action { transition: none !important; }
}
`;
