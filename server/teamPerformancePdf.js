/**
 * PDF «Команда и KPI» (A4 ландшафт). Единый тёмный стиль из reportTheme.js.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { renderLineChartPng } from './analyticsChartCanvas.js';
import { getReportLogoDataUri } from './reportLogo.js';
import {
  pickPalette, fmtRub, fmtNum, fmtDateRu, th, sectionTitle,
  sectionTable, statCard, baseDocDefinition,
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

const PAGE_MARGIN_X = 30;
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const CONTENT_W = Math.round(PAGE_W - 2 * PAGE_MARGIN_X);
const COL_GAP = 16;
const HALF_W = Math.round((CONTENT_W - COL_GAP) / 2);

function b64Png(buf) {
  if (!buf || !buf.length) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function dailyTurnoverSeries(dailyRows) {
  const m = new Map();
  for (const r of dailyRows || []) {
    const day = r.day ? String(r.day).slice(0, 10) : '';
    if (!day) continue;
    m.set(day, (m.get(day) || 0) + (Number(r.sumRub) || 0));
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    labels: sorted.map(([day]) => day.slice(5).replace('-', '.')),
    values: sorted.map(([, sum]) => sum),
  };
}

function weekDeltaCell(prev, cur, C) {
  if (!prev) return { text: '—', fontSize: 7.5, alignment: 'right', color: C.inkDim };
  const c = Number(cur?.sumRub) || 0;
  const p = Number(prev?.sumRub) || 0;
  if (p <= 0) return { text: c > 0 ? 'нов.' : '—', fontSize: 7.5, alignment: 'right', color: C.inkDim };
  const pct = Math.round(((c - p) / p) * 1000) / 10;
  const color = pct > 0.5 ? C.emerald : pct < -0.5 ? C.crimson : C.inkMuted;
  return { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`, fontSize: 7.5, alignment: 'right', color };
}

export async function buildTeamPerformancePdfBuffer(data, options = {}) {
  const C = pickPalette(options.theme === 'light' ? 'light' : 'dark');
  const nowStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const p = data.period || {};
  const t = data.totals;
  const ops = Array.isArray(data.operators) ? data.operators : [];
  const weeks = Array.isArray(data.byWeek) ? data.byWeek : [];
  const dailyRows = Array.isArray(data.dailyRows) ? data.dailyRows : [];

  const chartW = HALF_W;
  const chartH = 128;
  const { labels: dayLabels, values: dayValues } = dailyTurnoverSeries(dailyRows);
  const weekLabels = weeks.map((w) => {
    const s = String(w.weekStart || '').slice(0, 10);
    const [y, mo, d] = s.split('-');
    return y && mo && d ? `${d}.${mo}` : fmtDateRu(w.weekStart);
  });
  const weekValues = weeks.map((w) => Number(w.sumRub) || 0);

  const [bufDaily, bufWeek, logo] = await Promise.all([
    dayLabels.length > 0
      ? renderLineChartPng({ width: chartW * 2, height: chartH * 2, labels: dayLabels, values: dayValues, caption: 'Оборот по дням, ₽', yUnit: '₽', color: C.accent, isCurrency: true, theme: 'dark' })
      : Promise.resolve(Buffer.alloc(0)),
    weekLabels.length > 0
      ? renderLineChartPng({ width: chartW * 2, height: chartH * 2, labels: weekLabels, values: weekValues, caption: 'Оборот по неделям (ISO, пн), ₽', yUnit: '₽', color: C.amber, fillUnder: true, isCurrency: true, theme: 'dark' })
      : Promise.resolve(Buffer.alloc(0)),
    getReportLogoDataUri(),
  ]);

  const images = {};
  if (logo) images.brandLogo = logo;
  if (b64Png(bufDaily)) images.teamDay = b64Png(bufDaily);
  if (b64Png(bufWeek)) images.teamWeek = b64Png(bufWeek);

  const content = [];

  // ── Шапка ──
  const headerCols = [{
    width: '*',
    stack: [
      { text: 'Команда и KPI', fontSize: 18, bold: true, color: C.ink, characterSpacing: -0.3 },
      { text: `${fmtDateRu(p.from)} — ${fmtDateRu(p.to)}`, fontSize: 9, color: C.inkMuted, margin: [0, 4, 0, 0] },
      {
        text: (data.viewerIsManager
          ? 'Руководитель: видна вся команда. '
          : 'Только ваши сделки. ') + 'Сделка учитывается после скачивания PDF договора. Вес — по первой строке договора.',
        fontSize: 7, color: C.inkDim, margin: [0, 3, 0, 0],
      },
      { text: `Сформировано: ${nowStr}`, fontSize: 7, color: C.inkDim, margin: [0, 2, 0, 0] },
    ],
  }];
  if (logo) headerCols.push({ width: 34, image: 'brandLogo', fit: [34, 34], margin: [10, 0, 0, 0] });
  content.push({ columns: headerCols, columnGap: 12, margin: [0, 0, 0, 8] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 0, 0, 14] });

  if (!t || t.deals === 0) {
    content.push({ text: 'За выбранный период нет сделок по этим фильтрам.', fontSize: 9, color: C.inkMuted });
  } else {
    // ── KPI: 4 плитки в ряд ──
    const card = (label, value, valueColor) => ({ width: '*', ...statCard(C, { label, value, valueColor }) });
    content.push({
      columns: [
        card('Сделок', String(t.deals), C.ink),
        { width: 10, text: '' },
        card('Оборот', fmtRub(t.sumRub), C.accent),
        { width: 10, text: '' },
        card('Вес лом, г', fmtNum(t.weightGrossSum, 2), C.ink),
        { width: 10, text: '' },
        card('Вес чист., г', fmtNum(t.weightNetSum, 3), C.ink),
      ],
      margin: [0, 0, 0, 4],
    });

    // ── Графики (каждый с заголовком, неразрывно) ──
    if (images.teamDay || images.teamWeek) {
      content.push(sectionTitle('Динамика оборота', C));
      content.push({
        columnGap: COL_GAP,
        columns: [
          { width: '*', stack: images.teamDay ? [{ image: 'teamDay', width: chartW }] : [{ text: '' }] },
          { width: '*', stack: images.teamWeek ? [{ image: 'teamWeek', width: chartW }] : [{ text: '' }] },
        ],
        margin: [0, 0, 0, 4],
        unbreakable: true,
      });
    }

    // ── Рейтинг ──
    content.push(sectionTable(C, {
      title: 'Рейтинг по сотрудникам',
      head: [th('#', C), th('Учётная запись', C), th('Сделок', C, { alignment: 'right' }), th('Сумма', C, { alignment: 'right' }), th('Вес лом / чист., г', C, { alignment: 'right' }), th('% суммы', C, { alignment: 'right' })],
      rows: ops.map((r) => [
        { text: String(r.rank), fontSize: 8, color: C.accent, bold: true },
        { text: r.email || '—', fontSize: 8, color: C.ink },
        { text: String(r.deals), fontSize: 8, alignment: 'right', color: C.ink },
        { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right', color: C.ink },
        { text: `${fmtNum(r.weightGrossSum, 2)} / ${fmtNum(r.weightNetSum, 3)}`, fontSize: 7.5, alignment: 'right', color: C.inkMuted },
        { text: `${r.shareRubPct}%`, fontSize: 8, alignment: 'right', color: C.inkMuted },
      ]),
      widths: [22, '*', 40, 70, 110, 44],
    }));

    // ── По неделям ──
    if (weeks.length > 0) {
      content.push(sectionTable(C, {
        title: 'По неделям (ISO, пн — начало недели)',
        head: [th('Неделя с', C), th('Сделок', C, { alignment: 'right' }), th('Сумма', C, { alignment: 'right' }), th('к пред.', C, { alignment: 'right' }), th('Лом, г', C, { alignment: 'right' }), th('Чист., г', C, { alignment: 'right' })],
        rows: weeks.map((w, i) => [
          { text: fmtDateRu(w.weekStart), fontSize: 8, color: C.ink },
          { text: String(w.deals), fontSize: 8, alignment: 'right', color: C.ink },
          { text: fmtRub(w.sumRub), fontSize: 8, alignment: 'right', color: C.ink },
          weekDeltaCell(i > 0 ? weeks[i - 1] : null, w, C),
          { text: fmtNum(w.weightGrossSum, 2), fontSize: 8, alignment: 'right', color: C.inkMuted },
          { text: fmtNum(w.weightNetSum, 3), fontSize: 8, alignment: 'right', color: C.inkMuted },
        ]),
        widths: [70, 44, '*', 56, 60, 60],
      }));
    }
  }

  const docDef = {
    ...baseDocDefinition(C, { footerLabel: 'REAKTIVO PRO · команда и KPI', pageW: PAGE_W, pageH: PAGE_H, marginX: PAGE_MARGIN_X, orientation: 'landscape' }),
    content,
  };
  if (Object.keys(images).length) docDef.images = images;
  return pdfMake.createPdf(docDef).getBuffer();
}
