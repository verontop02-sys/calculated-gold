/**
 * PDF-отчёт по дашборду.
 * Использует pdfmake (портрет A4) + @napi-rs/canvas для area-графика.
 * Палитра подбирается по теме: dark / light.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── шрифты ──────────────────────────────────────────────────────────────────
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
  const reg = (p, alias) => GlobalFonts.registerFromPath(p, alias);
  reg(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf'), 'DRpt');
  reg(join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf'), 'DRptB');
  _canvasFontsReady = true;
}

// ── логотип ──────────────────────────────────────────────────────────────────
let LOGO_B64 = null;
(() => {
  const cands = [
    join(__dirname, '..', 'client', 'public', 'logo_reactivo1.png'),
    join(__dirname, '..', 'logo_reactivo1.png'),
  ];
  for (const p of cands) {
    try {
      const buf = readFileSync(p);
      if (buf?.length) { LOGO_B64 = `data:image/png;base64,${buf.toString('base64')}`; break; }
    } catch { /* skip */ }
  }
})();

// ── форматирование ───────────────────────────────────────────────────────────
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const fmtRub = (n) => (n == null || !Number.isFinite(Number(n))) ? '—' : fmt.format(Math.round(Number(n))) + ' ₽';

function deltaTxt(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(Number(cur)) || !Number.isFinite(Number(prev)) || Number(prev) === 0) return null;
  const pct = ((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 100;
  return { pct, label: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, up: pct >= 0 };
}

// ── рисуем area-график через canvas ─────────────────────────────────────────
async function renderFlowChart(series, themeColor, W = 1560, H = 360) {
  ensureCanvasFonts();
  const n = series.length;
  if (n < 2) return null;

  const vals = series.map((s) => Number(s.sum) || 0);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals, 1);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.01);
  lo = Math.max(0, lo - pad);
  hi = hi + pad;

  const pl = 80, pr = 24, pt = 32, pb = 56;
  const cW = W - pl - pr;
  const cH = H - pt - pb;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Фон
  ctx.fillStyle = '#1a1c24';
  ctx.fillRect(0, 0, W, H);

  // Лёгкая сетка
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const y = pt + cH - (i / ticks) * cH;
    ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + cW, y); ctx.stroke();
    const v = lo + (hi - lo) * (i / ticks);
    const lbl = v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v));
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '20px "DRpt"';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, pl - 8, y);
  }

  // X-подписи
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '18px "DRpt"';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const stepL = n > 20 ? Math.ceil(n / 10) : n > 10 ? 2 : 1;
  for (let i = 0; i < n; i += stepL) {
    const x = pl + (i / (n - 1)) * cW;
    const d = String(series[i].x || '');
    const lbl = d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d;
    ctx.fillText(lbl, x, H - 32);
  }

  // Вычисляем точки
  const pts = series.map((s, i) => ({
    x: pl + (i / (n - 1)) * cW,
    y: pt + cH - ((Math.max(lo, Math.min(hi, Number(s.sum) || 0)) - lo) / (hi - lo)) * cH,
  }));

  // Заливка
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pt + cH);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(pts[n - 1].x, pt + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pt, 0, pt + cH);
  grad.addColorStop(0, `${themeColor}70`);
  grad.addColorStop(0.65, `${themeColor}1a`);
  grad.addColorStop(1, `${themeColor}00`);
  ctx.fillStyle = grad;
  ctx.fill();

  // Линия
  ctx.beginPath();
  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();

  // Точки
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1c24';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const buf = await canvas.encode('png');
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ── палитра ──────────────────────────────────────────────────────────────────
const PALETTE = {
  dark: {
    accent: '#8b7cff', accentDim: '#5d4fc7', emerald: '#4ade80', emeraldBg: '#162421',
    crimson: '#fb7185', crimsonBg: '#271620',
    ink: '#f4f5f7', inkMuted: 'rgba(244,245,247,0.65)', inkDim: 'rgba(244,245,247,0.42)',
    panel: '#16181e', elevated: '#1a1c24', stroke: 'rgba(255,255,255,0.10)',
    headFill: '#1e2030', rowEven: '#16181e', rowOdd: '#1a1c24', thFill: '#1e2230',
    headTxt: '#a799ff', chartColor: '#8b7cff',
  },
  light: {
    accent: '#e02d5f', accentDim: '#b51e4a', emerald: '#12824f', emeraldBg: '#f0faf5',
    crimson: '#d92d3a', crimsonBg: '#fff4f4',
    ink: '#16181d', inkMuted: 'rgba(22,24,29,0.65)', inkDim: 'rgba(22,24,29,0.45)',
    panel: '#ffffff', elevated: '#fafafa', stroke: 'rgba(20,22,30,0.10)',
    headFill: '#f4eef0', rowEven: '#faf9fa', rowOdd: '#ffffff', thFill: '#f0e8eb',
    headTxt: '#b51e4a', chartColor: '#e02d5f',
  },
};

const MARGIN_X = 28;
const PAGE_W = 595.28;
const CONTENT_W = Math.round(PAGE_W - MARGIN_X * 2);

// ── таблицы ──────────────────────────────────────────────────────────────────
function makeLayout(C) {
  return {
    hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0.3),
    vLineWidth: () => 0,
    paddingLeft: () => 10, paddingRight: () => 10,
    paddingTop: () => 6, paddingBottom: () => 6,
    hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? C.accent : C.stroke),
    fillColor: (i) => (i === 0 ? C.thFill : i % 2 === 1 ? C.rowOdd : C.rowEven),
  };
}

function th(text, C, opt = {}) {
  return { text, bold: true, fontSize: 7.5, color: C.headTxt, ...opt };
}

// ── основная функция ──────────────────────────────────────────────────────────
export async function buildDashboardReportPdf(payload) {
  const theme = payload.theme === 'light' ? 'light' : 'dark';
  const C = PALETTE[theme];
  const fm = (n) => fmtRub(n);

  const nowStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const kpis = payload.kpis || {};
  const flow = Array.isArray(payload.flow) ? payload.flow : [];
  const staff = Array.isArray(payload.staff) ? payload.staff : [];
  const market = Array.isArray(payload.market) ? payload.market : [];
  const probes = Array.isArray(payload.probes) ? payload.probes : [];
  const recent = Array.isArray(payload.recent) ? payload.recent : [];
  const today = payload.today || {};

  // Рисуем график
  const chartB64 = flow.length >= 2
    ? await renderFlowChart(flow, C.chartColor)
    : null;

  const images = {};
  if (LOGO_B64) images.brandLogo = LOGO_B64;
  if (chartB64) images.flowChart = chartB64;

  const layout = makeLayout(C);

  // ── KPI-карточки: 2×2 через колонки ──
  function kpiBlock(label, valueTxt, cur, prev, prevTxt) {
    const d = deltaTxt(cur, prev);
    return {
      stack: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: CONTENT_W / 2 - 8, h: 58, r: 8, color: C.elevated, lineColor: C.stroke, lineWidth: 0.5 }] },
        {
          relativePosition: { x: 12, y: -50 },
          stack: [
            { text: label.toUpperCase(), fontSize: 6.5, bold: true, color: C.inkMuted, characterSpacing: 0.08 },
            { text: valueTxt, fontSize: 16, bold: true, color: C.ink, margin: [0, 4, 0, 4] },
            {
              columns: [
                d ? { text: d.label, fontSize: 7, bold: true, color: d.up ? C.emerald : C.crimson } : { text: '—', fontSize: 7, color: C.inkDim },
                { text: `пред.: ${prevTxt}`, fontSize: 6.5, color: C.inkDim, alignment: 'right' },
              ],
            },
          ],
        },
      ],
      margin: [0, 0, 0, 0],
    };
  }

  const kpiRows = [
    [
      kpiBlock('Оборот, 30 дней', fm(kpis.sum?.cur), kpis.sum?.cur, kpis.sum?.prev, fm(kpis.sum?.prev)),
      kpiBlock('Сделок', String(kpis.deals?.cur ?? '—'), kpis.deals?.cur, kpis.deals?.prev, String(kpis.deals?.prev ?? '—')),
    ],
    [
      kpiBlock('Клиентов', String(kpis.clients?.cur ?? '—'), kpis.clients?.cur, kpis.clients?.prev, String(kpis.clients?.prev ?? '—')),
      kpiBlock('Средний чек', kpis.avg?.cur != null ? fm(Math.round(kpis.avg.cur)) : '—', kpis.avg?.cur, kpis.avg?.prev, kpis.avg?.prev != null ? fm(Math.round(kpis.avg.prev)) : '—'),
    ],
  ];

  // ── раздел «Выкуп по пробам» ──
  const probeBody = probes.length ? [
    [th('Проба', C), th('Цена за г, ₽', C, { alignment: 'right' })],
    ...probes.map((p) => [
      { text: `${p.probe} пр.`, fontSize: 8, color: p.probe === 585 ? C.accent : C.ink, bold: p.probe === 585 },
      { text: fm(p.v), fontSize: 8, alignment: 'right', color: C.ink },
    ]),
  ] : null;

  // ── раздел «Команда» ──
  const staffBody = staff.length ? [
    [th('#', C), th('Сотрудник', C), th('Сделок', C, { alignment: 'right' }), th('Оборот', C, { alignment: 'right' }), th('Доля', C, { alignment: 'right' })],
    ...staff.map((s, i) => [
      { text: String(i + 1), fontSize: 7.5, color: C.accent, bold: true },
      { text: s.name || '—', fontSize: 8, color: C.ink },
      { text: String(s.deals || 0), fontSize: 8, alignment: 'right' },
      { text: fm(s.sumRub), fontSize: 8, alignment: 'right', color: C.ink },
      { text: `${s.share || 0}%`, fontSize: 8, alignment: 'right', color: C.inkMuted },
    ]),
  ] : null;

  // ── раздел «Рынок» ──
  const marketBody = market.length ? [
    [th('Город', C), th('Ср. цена конк.', C, { alignment: 'right' }), th('Наше преим.', C, { alignment: 'right' })],
    ...market.map((m) => [
      { text: m.name || '—', fontSize: 8, color: C.ink },
      { text: m.avg != null ? fm(Math.round(m.avg)) : '—', fontSize: 8, alignment: 'right' },
      m.adv != null
        ? { text: `${m.adv >= 0 ? '+' : ''}${m.adv.toFixed(1)}%`, fontSize: 8, alignment: 'right', color: m.adv >= 0 ? C.emerald : C.crimson, bold: true }
        : { text: '—', fontSize: 8, alignment: 'right', color: C.inkDim },
    ]),
  ] : null;

  // ── раздел «Последние договоры» ──
  const recentBody = recent.length ? [
    [th('Клиент', C), th('Договор', C), th('Сумма', C, { alignment: 'right' }), th('Время', C, { alignment: 'right' })],
    ...recent.map((r) => [
      { text: r.name || 'Без имени', fontSize: 8, color: C.ink },
      { text: (r.contractNo ? `№ ${r.contractNo}` : '—') + (r.probe ? ` · ${r.probe} пр.` : '') + (r.weight ? ` · ${r.weight} г` : ''), fontSize: 7.5, color: C.inkMuted },
      { text: fm(r.sum), fontSize: 8, alignment: 'right', color: C.ink },
      { text: r.time || '—', fontSize: 7.5, alignment: 'right', color: C.inkDim },
    ]),
  ] : null;

  function sectionTitle(text) {
    return { text: text.toUpperCase(), fontSize: 7.5, bold: true, color: C.inkMuted, characterSpacing: 0.10, margin: [0, 14, 0, 6] };
  }

  function tbl(body, widths, m = [0, 0, 0, 0]) {
    return { table: { widths, body }, layout, margin: m };
  }

  const content = [];

  // Шапка
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
        { text: `КУРС ЗОЛОТА · ${(payload.gold.source || 'ЦБ РФ').toUpperCase()}`, fontSize: 6.5, bold: true, color: C.inkMuted, characterSpacing: 0.08, alignment: 'right' },
        { text: fm(payload.gold.value), fontSize: 18, bold: true, color: C.accent, alignment: 'right', margin: [0, 4, 0, 0] },
        { text: '/ г', fontSize: 8, color: C.inkMuted, alignment: 'right' },
      ],
    });
  }
  if (LOGO_B64) {
    headerCols.push({ width: 36, image: 'brandLogo', fit: [36, 36], margin: [8, 0, 0, 0] });
  }

  content.push({ columns: headerCols, columnGap: 12, margin: [0, 0, 0, 8] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 0, 0, 12] });

  // KPI-блоки
  for (const [a, b] of kpiRows) {
    content.push({ columns: [{ width: '*', ...a }, { width: 8, text: '' }, { width: '*', ...b }], margin: [0, 0, 0, 10] });
  }

  // Сегодня + Выкуп по пробам
  content.push(sectionTitle('Сегодня и выкуп по пробам'));
  const leftToday = {
    width: '*',
    stack: [
      { text: 'Сегодня', fontSize: 9, bold: true, color: C.ink, margin: [0, 0, 0, 6] },
      {
        columns: [
          { stack: [{ text: String(today.count ?? 0), fontSize: 20, bold: true, color: C.ink }, { text: 'сделок', fontSize: 7.5, color: C.inkMuted }] },
          { stack: [{ text: fm(today.sumRub), fontSize: 20, bold: true, color: C.ink }, { text: 'оборот', fontSize: 7.5, color: C.inkMuted }] },
        ],
        columnGap: 20,
      },
    ],
  };
  const rightProbes = probeBody
    ? { width: '*', stack: [{ text: 'Выкуп по пробам', fontSize: 9, bold: true, color: C.ink, margin: [0, 0, 0, 6] }, tbl(probeBody, ['auto', '*'])] }
    : { width: '*', text: '' };

  content.push({ columns: [leftToday, { width: 16, text: '' }, rightProbes], margin: [0, 0, 0, 0] });

  // График
  content.push(sectionTitle('Денежный поток · оборот по дням'));
  if (chartB64) {
    content.push({ image: 'flowChart', width: CONTENT_W, fit: [CONTENT_W, 180], margin: [0, 0, 0, 4] });
  } else {
    content.push({ text: 'Нет данных за период', fontSize: 8, color: C.inkDim, margin: [0, 4, 0, 8] });
  }

  // Команда
  if (staffBody) {
    content.push(sectionTitle('Команда · топ по обороту за 30 дней'));
    content.push(tbl(staffBody, ['auto', '*', 'auto', 'auto', 'auto']));
  }

  // Рынок
  if (marketBody) {
    content.push(sectionTitle('Рынок · 585 проба'));
    content.push(tbl(marketBody, ['*', 'auto', 'auto']));
  }

  // Последние договоры
  if (recentBody) {
    content.push(sectionTitle('Последние договоры'));
    content.push(tbl(recentBody, ['*', '*', 'auto', 'auto']));
  }

  const docDef = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN_X, 28, MARGIN_X, 28],
    background: () => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 841.89, color: C.panel }],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 9, color: C.ink, lineHeight: 1.3 },
    footer: (cur, tot) => ({
      margin: [MARGIN_X, 4, MARGIN_X, 0],
      columns: [
        { text: 'REAKTIVO PRO · отчёт по дашборду', color: C.inkDim, fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: C.inkDim, fontSize: 6.5 },
      ],
    }),
    content,
  };

  if (Object.keys(images).length) docDef.images = images;
  return pdfMake.createPdf(docDef).getBuffer();
}
