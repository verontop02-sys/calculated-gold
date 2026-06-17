/**
 * PDF-отчёт по дашборду (портрет A4).
 * pdfmake + @napi-rs/canvas (area-график). Единый тёмный стиль из reportTheme.js.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { getReportLogoDataUri } from './reportLogo.js';
import {
  pickPalette, fmtRub, deltaParts, dataTableLayout, th, sectionTitle,
  statCard, baseDocDefinition,
} from './reportTheme.js';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));

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

export async function buildDashboardReportPdf(payload) {
  const theme = payload.theme === 'light' ? 'light' : 'dark';
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
  const logo = await getReportLogoDataUri();

  const images = {};
  if (logo) images.brandLogo = logo;
  if (chartB64) images.flowChart = chartB64;

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

  // ── KPI 2×2 ──
  content.push({ columns: [{ width: '*', ...kpiSum }, { width: 10, text: '' }, { width: '*', ...kpiDeals }], margin: [0, 0, 0, 10] });
  content.push({ columns: [{ width: '*', ...kpiCl }, { width: 10, text: '' }, { width: '*', ...kpiAvg }], margin: [0, 0, 0, 0] });

  // ── Сегодня + Выкуп по пробам ──
  content.push(sectionTitle('Сегодня и выкуп по пробам', C));
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
  content.push({ columns: [leftToday, { width: 14, text: '' }, rightProbes], columnGap: 0, margin: [0, 0, 0, 0] });

  // ── График ──
  content.push(sectionTitle('Денежный поток · оборот по дням', C));
  if (chartB64) {
    content.push({ image: 'flowChart', width: CONTENT_W, margin: [0, 0, 0, 2] });
  } else {
    content.push({ text: 'Нет данных за период', fontSize: 8, color: C.inkDim, margin: [0, 2, 0, 6] });
  }

  // ── Команда ──
  if (staff.length) {
    content.push(sectionTitle('Команда · топ по обороту за 30 дней', C));
    content.push(tbl([
      [th('#', C), th('Сотрудник', C), th('Сделок', C, { alignment: 'right' }), th('Оборот', C, { alignment: 'right' }), th('Доля', C, { alignment: 'right' })],
      ...staff.map((s, i) => [
        { text: String(i + 1), fontSize: 7.5, color: C.accent, bold: true },
        { text: s.name || '—', fontSize: 8, color: C.ink },
        { text: String(s.deals || 0), fontSize: 8, alignment: 'right', color: C.ink },
        { text: fm(s.sumRub), fontSize: 8, alignment: 'right', color: C.ink },
        { text: `${s.share || 0}%`, fontSize: 8, alignment: 'right', color: C.inkMuted },
      ]),
    ], ['auto', '*', 'auto', 'auto', 'auto']));
  }

  // ── Рынок ──
  if (market.length) {
    content.push(sectionTitle('Рынок · 585 проба', C));
    content.push(tbl([
      [th('Город', C), th('Ср. цена конк.', C, { alignment: 'right' }), th('Наше преим.', C, { alignment: 'right' })],
      ...market.map((m) => {
        const advCell = m.adv != null
          ? { text: `${m.adv >= 0 ? '+' : '−'}${Math.abs(m.adv).toFixed(1)}%`, fontSize: 8, alignment: 'right', color: m.adv >= 0 ? C.emerald : C.crimson, bold: true }
          : { text: '—', fontSize: 8, alignment: 'right', color: C.inkDim };
        return [
          { text: m.name || '—', fontSize: 8, color: C.ink },
          { text: m.avg != null ? fm(Math.round(m.avg)) : '—', fontSize: 8, alignment: 'right', color: C.ink },
          advCell,
        ];
      }),
    ], ['*', 'auto', 'auto']));
  }

  // ── Последние договоры ──
  if (recent.length) {
    content.push(sectionTitle('Последние договоры', C));
    content.push(tbl([
      [th('Клиент', C), th('Договор', C), th('Сумма', C, { alignment: 'right' }), th('Время', C, { alignment: 'right' })],
      ...recent.map((r) => [
        { text: r.name || 'Без имени', fontSize: 8, color: C.ink },
        { text: (r.contractNo ? `№ ${r.contractNo}` : '—') + (r.probe ? ` · ${r.probe} пр.` : '') + (r.weight ? ` · ${r.weight} г` : ''), fontSize: 7.5, color: C.inkMuted },
        { text: fm(r.sum), fontSize: 8, alignment: 'right', color: C.ink },
        { text: r.time || '—', fontSize: 7.5, alignment: 'right', color: C.inkDim },
      ]),
    ], ['*', '*', 'auto', 'auto']));
  }

  const docDef = {
    ...baseDocDefinition(C, { footerLabel: 'REAKTIVO PRO · отчёт по дашборду', pageW: PAGE_W, marginX: MARGIN_X }),
    content,
  };
  if (Object.keys(images).length) docDef.images = images;
  return pdfMake.createPdf(docDef).getBuffer();
}
