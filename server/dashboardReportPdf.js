/**
 * PDF-отчёт по дашборду (портрет A4).
 * pdfmake + @napi-rs/canvas (area-график). Единый тёмный стиль из reportTheme.js.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { getReportLogoDataUri } from './reportLogo.js';
import {
  pickPalette, fmtRub, deltaParts, dataTableLayout, th, sectionTitle,
  sectionTable, keepTogether, statCard, baseDocDefinition,
} from './reportTheme.js';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));
const __dirname = dirname(fileURLToPath(import.meta.url));

pdfMake.setFonts({
  Roboto: {
    normal:      join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf'),
    bold:        join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf'),
    italics:     join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-MediumItalic.ttf'),
  },
});

let _canvasFontsReady = false;
function ensureCanvasFonts() {
  if (_canvasFontsReady) return;
  GlobalFonts.registerFromPath(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf'), 'DRpt');
  GlobalFonts.registerFromPath(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf'), 'DRptB');
  _canvasFontsReady = true;
}

const MARGIN_X = 28;
const PAGE_W = 595.28;
const CONTENT_W = Math.round(PAGE_W - MARGIN_X * 2);

/** Area-график денежного потока (raster через canvas). */
async function renderFlowChart(series, C, W = 1480, H = 320) {
  ensureCanvasFonts();
  const n = series.length;
  if (n < 2) return null;

  const vals = series.map((s) => Number(s.sum) || 0);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals, 1);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.01);
  lo = Math.max(0, lo - pad);
  hi += pad;

  const pl = 86, pr = 26, pt = 26, pb = 50;
  const cW = W - pl - pr;
  const cH = H - pt - pb;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.chartBg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = C.chartGrid;
  ctx.lineWidth = 1;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const y = pt + cH - (i / ticks) * cH;
    ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + cW, y); ctx.stroke();
    const v = lo + (hi - lo) * (i / ticks);
    const lbl = v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v));
    ctx.fillStyle = C.chartText;
    ctx.font = '20px "DRpt"';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, pl - 10, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '18px "DRpt"';
  ctx.fillStyle = C.chartText;
  const stepL = n > 20 ? Math.ceil(n / 10) : n > 10 ? 2 : 1;
  for (let i = 0; i < n; i += stepL) {
    const x = pl + (i / (n - 1)) * cW;
    const d = String(series[i].x || '');
    const lbl = d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d;
    ctx.fillText(lbl, x, H - 30);
  }

  const pts = series.map((s, i) => ({
    x: pl + (i / (n - 1)) * cW,
    y: pt + cH - ((Math.max(lo, Math.min(hi, Number(s.sum) || 0)) - lo) / (hi - lo)) * cH,
  }));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pt + cH);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(pts[n - 1].x, pt + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pt, 0, pt + cH);
  grad.addColorStop(0, `${C.accent}73`);
  grad.addColorStop(0.7, `${C.accent}1f`);
  grad.addColorStop(1, `${C.accent}00`);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  for (const p of pts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = C.chartBg; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
  }

  const buf = await canvas.encode('png');
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const WORLD_CLOCK_CITIES = [
  { key: 'moscow', label: 'Москва', code: 'MSK', tz: 'Europe/Moscow', dark: 'moscow.jpg', light: 'moscow-day.jpg' },
  { key: 'newyork', label: 'Нью-Йорк', code: 'NYC', tz: 'America/New_York', dark: 'newyork.jpg', light: 'newyork-day.jpg' },
  { key: 'london', label: 'Лондон', code: 'LDN', tz: 'Europe/London', dark: 'london.jpg', light: 'london-day.jpg' },
];

const CITY_IMG_DIRS = [
  join(__dirname, '..', 'client', 'public', 'cities'),
  join(__dirname, '..', 'client', 'dist', 'cities'),
];

function tzHm(now, tz) {
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value || '00';
    return `${get('hour')}:${get('minute')}`;
  } catch {
    return '—:—';
  }
}

function tzDateShort(now, tz) {
  try {
    const s = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'long' }).format(now);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return '';
  }
}

/** Три плитки мирового времени с фото городов → data-URL PNG. */
async function renderWorldClockTiles(theme = 'dark', W = 1480, H = 220) {
  ensureCanvasFonts();
  const now = new Date();
  const isLight = theme === 'light';
  const gap = 14;
  const tileW = Math.floor((W - gap * 2) / 3);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i < WORLD_CLOCK_CITIES.length; i++) {
    const c = WORLD_CLOCK_CITIES[i];
    const x = i * (tileW + gap);
    const file = isLight ? c.light : c.dark;
    let loaded = null;
    for (const dir of CITY_IMG_DIRS) {
      try {
        loaded = await loadImage(join(dir, file));
        break;
      } catch {
        /* next */
      }
    }

    // фон / фото
    ctx.save();
    roundRectPath(ctx, x, 0, tileW, H, 14);
    ctx.clip();
    if (loaded) {
      const scale = Math.max(tileW / loaded.width, H / loaded.height);
      const dw = loaded.width * scale;
      const dh = loaded.height * scale;
      ctx.drawImage(loaded, x + (tileW - dw) / 2, (H - dh) * 0.38 - dh * 0.38, dw, dh);
    } else {
      ctx.fillStyle = '#1a1c1f';
      ctx.fillRect(x, 0, tileW, H);
    }
    // затемнение
    const shade = ctx.createLinearGradient(x, 0, x, H);
    shade.addColorStop(0, 'rgba(8,9,12,0.62)');
    shade.addColorStop(0.42, 'rgba(8,9,12,0.18)');
    shade.addColorStop(1, 'rgba(8,9,12,0.66)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, tileW, H);
    if (c.key === 'moscow') {
      const red = ctx.createLinearGradient(x, 0, x + tileW, H);
      red.addColorStop(0, 'rgba(254,0,0,0.22)');
      red.addColorStop(0.55, 'rgba(254,0,0,0)');
      ctx.fillStyle = red;
      ctx.fillRect(x, 0, tileW, H);
    }

    // текст
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "DRptB"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(c.label, x + 18, 16);

    ctx.font = 'bold 14px "DRpt"';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.textAlign = 'right';
    ctx.fillText(c.code, x + tileW - 18, 20);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px "DRptB"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(tzHm(now, c.tz), x + 18, H - 18);

    ctx.font = '600 16px "DRpt"';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.textAlign = 'right';
    ctx.fillText(tzDateShort(now, c.tz), x + tileW - 18, H - 22);

    ctx.restore();
  }

  const buf = await canvas.encode('png');
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function buildDashboardReportPdf(payload) {
  const theme = payload.theme === 'dark' ? 'dark' : 'light';
  const C = pickPalette(theme);
  const fm = fmtRub;

  const nowStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const kpis = payload.kpis || {};
  const flow = Array.isArray(payload.flow) ? payload.flow : [];
  const staff = Array.isArray(payload.staff) ? payload.staff : [];
  const market = Array.isArray(payload.market) ? payload.market : [];
  const probes = Array.isArray(payload.probes) ? payload.probes : [];
  const recent = Array.isArray(payload.recent) ? payload.recent : [];
  const today = payload.today || {};

  const chartB64 = flow.length >= 2 ? await renderFlowChart(flow, C) : null;
  const clocksB64 = await renderWorldClockTiles(theme);
  const logo = await getReportLogoDataUri();

  const images = {};
  if (logo) images.brandLogo = logo;
  if (chartB64) images.flowChart = chartB64;
  if (clocksB64) images.worldClocks = clocksB64;

  const layout = dataTableLayout(C);
  const tbl = (body, widths, m = [0, 0, 0, 0]) => ({ table: { widths, body }, layout, margin: m });

  // ── KPI-карточка через statCard (надёжная высота по контенту) ──
  function kpi(label, valueTxt, cur, prev) {
    const d = deltaParts(cur, prev, C);
    return statCard(C, {
      label,
      value: valueTxt,
      footColumns: [
        { text: d.text, fontSize: 7.5, bold: true, color: d.color },
        { text: `пред.: ${prev != null && Number.isFinite(Number(prev)) ? (typeof prev === 'number' && prev > 1000 ? fm(prev) : prev) : '—'}`, fontSize: 6.5, color: C.inkDim, alignment: 'right' },
      ],
    });
  }

  const kpiSum   = kpi('Оборот, 30 дней', fm(kpis.sum?.cur), kpis.sum?.cur, kpis.sum?.prev);
  const kpiDeals = kpi('Сделок', String(kpis.deals?.cur ?? '—'), kpis.deals?.cur, kpis.deals?.prev);
  const kpiCl    = kpi('Клиентов', String(kpis.clients?.cur ?? '—'), kpis.clients?.cur, kpis.clients?.prev);
  const kpiAvg   = kpi('Средний чек', kpis.avg?.cur != null ? fm(Math.round(kpis.avg.cur)) : '—', kpis.avg?.cur, kpis.avg?.prev);

  const content = [];

  // ── Шапка ──
  const headerCols = [
    {
      width: '*',
      stack: [
        { text: 'Сводка дашборда', fontSize: 18, bold: true, color: C.ink, characterSpacing: -0.3 },
        { text: `За последние 30 дней · ${payload.rangeLabel || ''}${payload.userName ? `  ·  ${payload.userName}` : ''}`, fontSize: 8.5, color: C.inkMuted, margin: [0, 4, 0, 0] },
        { text: `Сформировано: ${nowStr}`, fontSize: 7.5, color: C.inkDim, margin: [0, 2, 0, 0] },
      ],
    },
  ];
  if (payload.gold?.value != null) {
    headerCols.push({
      width: 'auto',
      stack: [
        { text: `КУРС ЗОЛОТА · ${(payload.gold.source || 'ЦБ РФ').toUpperCase()}`, fontSize: 6.5, bold: true, color: C.inkMuted, characterSpacing: 0.06, alignment: 'right' },
        { text: fm(payload.gold.value), fontSize: 18, bold: true, color: C.accent, alignment: 'right', margin: [0, 4, 0, 0] },
        { text: '/ г', fontSize: 8, color: C.inkMuted, alignment: 'right' },
      ],
    });
  }
  if (logo) headerCols.push({ width: 34, image: 'brandLogo', fit: [34, 34], margin: [10, 0, 0, 0] });

  content.push({ columns: headerCols, columnGap: 12, margin: [0, 0, 0, 8] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 0, 0, 14] });

  // ── Мировое время с фото городов ──
  if (clocksB64) {
    content.push({ image: 'worldClocks', width: CONTENT_W, margin: [0, 0, 0, 12] });
  }

  // ── KPI 2×2 ──
  content.push({ columns: [{ width: '*', ...kpiSum }, { width: 10, text: '' }, { width: '*', ...kpiDeals }], margin: [0, 0, 0, 10] });
  content.push({ columns: [{ width: '*', ...kpiCl }, { width: 10, text: '' }, { width: '*', ...kpiAvg }], margin: [0, 0, 0, 0] });

  // ── Сегодня + Выкуп по пробам ──
  const todayTitle = sectionTitle('Сегодня и выкуп по пробам', C);
  const leftToday = {
    width: '*',
    table: {
      widths: ['*'],
      body: [[{
        fillColor: C.elevated,
        border: [true, true, true, true],
        stack: [
          { text: 'СЕГОДНЯ', fontSize: 6.5, bold: true, color: C.inkMuted, characterSpacing: 0.06, margin: [0, 0, 0, 8] },
          {
            columns: [
              { stack: [{ text: String(today.count ?? 0), fontSize: 19, bold: true, color: C.ink }, { text: 'сделок', fontSize: 7.5, color: C.inkMuted }] },
              { stack: [{ text: fm(today.sumRub), fontSize: 19, bold: true, color: C.ink }, { text: 'оборот', fontSize: 7.5, color: C.inkMuted }] },
            ],
            columnGap: 16,
          },
        ],
      }]],
    },
    layout: {
      hLineWidth: (i) => (i === 0 ? 2 : 0.6), vLineWidth: () => 0.6,
      hLineColor: (i) => (i === 0 ? C.accent : C.stroke), vLineColor: () => C.stroke,
      paddingLeft: () => 13, paddingRight: () => 13, paddingTop: () => 11, paddingBottom: () => 11,
    },
  };
  const probeBody = probes.length ? [
    [th('Проба', C), th('Цена за г, ₽', C, { alignment: 'right' })],
    ...probes.map((p) => [
      { text: `${p.probe} пр.`, fontSize: 8, color: p.probe === 585 ? C.accent : C.ink, bold: p.probe === 585 },
      { text: fm(p.v), fontSize: 8, alignment: 'right', color: C.ink },
    ]),
  ] : null;
  const rightProbes = probeBody
    ? { width: '*', stack: [tbl(probeBody, ['auto', '*'])] }
    : { width: '*', text: '' };
  // Заголовок + блок «сегодня/пробы» держим вместе.
  content.push(keepTogether(
    todayTitle,
    { columns: [leftToday, { width: 14, text: '' }, rightProbes], columnGap: 0, margin: [0, 0, 0, 0] },
  ));

  // ── График (заголовок + картинка неразрывно) ──
  if (chartB64) {
    content.push(keepTogether(
      sectionTitle('Денежный поток · оборот по дням', C),
      { image: 'flowChart', width: CONTENT_W, margin: [0, 0, 0, 2] },
    ));
  } else {
    content.push(sectionTitle('Денежный поток · оборот по дням', C));
    content.push({ text: 'Нет данных за период', fontSize: 8, color: C.inkDim, margin: [0, 2, 0, 6] });
  }

  // ── Команда ──
  if (staff.length) {
    content.push(sectionTable(C, {
      title: 'Команда · топ по обороту за 30 дней',
      head: [th('#', C), th('Сотрудник', C), th('Сделок', C, { alignment: 'right' }), th('Оборот', C, { alignment: 'right' }), th('Доля', C, { alignment: 'right' })],
      rows: staff.map((s, i) => [
        { text: String(i + 1), fontSize: 7.5, color: C.accent, bold: true },
        { text: s.name || '—', fontSize: 8, color: C.ink },
        { text: String(s.deals || 0), fontSize: 8, alignment: 'right', color: C.ink },
        { text: fm(s.sumRub), fontSize: 8, alignment: 'right', color: C.ink },
        { text: `${s.share || 0}%`, fontSize: 8, alignment: 'right', color: C.inkMuted },
      ]),
      widths: ['auto', '*', 'auto', 'auto', 'auto'],
    }));
  }

  // ── Рынок ──
  if (market.length) {
    content.push(sectionTable(C, {
      title: 'Рынок · 585 проба',
      head: [th('Город', C), th('Ср. цена конк.', C, { alignment: 'right' }), th('Наше преим.', C, { alignment: 'right' })],
      rows: market.map((m) => [
        { text: m.name || '—', fontSize: 8, color: C.ink },
        { text: m.avg != null ? fm(Math.round(m.avg)) : '—', fontSize: 8, alignment: 'right', color: C.ink },
        m.adv != null
          ? { text: `${m.adv >= 0 ? '+' : '−'}${Math.abs(m.adv).toFixed(1)}%`, fontSize: 8, alignment: 'right', color: m.adv >= 0 ? C.emerald : C.crimson, bold: true }
          : { text: '—', fontSize: 8, alignment: 'right', color: C.inkDim },
      ]),
      widths: ['*', 'auto', 'auto'],
    }));
  }

  // ── Последние договоры ──
  if (recent.length) {
    content.push(sectionTable(C, {
      title: 'Последние договоры',
      head: [th('Клиент', C), th('Договор', C), th('Сумма', C, { alignment: 'right' }), th('Время', C, { alignment: 'right' })],
      rows: recent.map((r) => [
        { text: r.name || 'Без имени', fontSize: 8, color: C.ink },
        { text: (r.contractNo ? `№ ${r.contractNo}` : '—') + (r.probe ? ` · ${r.probe} пр.` : '') + (r.weight ? ` · ${r.weight} г` : ''), fontSize: 7.5, color: C.inkMuted },
        { text: fm(r.sum), fontSize: 8, alignment: 'right', color: C.ink },
        { text: r.time || '—', fontSize: 7.5, alignment: 'right', color: C.inkDim },
      ]),
      widths: ['*', '*', 'auto', 'auto'],
    }));
  }

  const docDef = {
    ...baseDocDefinition(C, {
      footerLabel: 'REAKTIVO PRO · отчёт по дашборду',
      pageW: PAGE_W,
      marginX: MARGIN_X,
      pageHeader: {
        sectionTitle: 'Сводка дашборда',
        authorName: payload?.userName || '',
        generatedAt: nowStr,
        logo: images.brandLogo || null,
      },
    }),
    content,
  };
  if (Object.keys(images).length) docDef.images = images;
  return pdfMake.createPdf(docDef).getBuffer();
}
