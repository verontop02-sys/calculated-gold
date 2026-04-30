import { createRequire } from 'module';
import { dirname, join } from 'path';
import { renderLineChartPng, renderDualLineChartPng, renderBarChartPng } from './analyticsChartCanvas.js';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));

pdfMake.setFonts({
  Roboto: {
    normal: join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf'),
    bold: join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf'),
    italics: join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-MediumItalic.ttf'),
  },
});

const fmtRub = (n) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
};

const fmtNum = (n, fd = 2) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(n);
};

const fmtDateRu = (iso) => {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}.${m}.${y}`;
};

const weekLabel = (key) => {
  if (!key) return '';
  const p = String(key).split('-');
  if (p.length < 3) return key;
  const [, mo, d] = p;
  return `${d}.${mo}`;
};

const monthLabel = (key) => {
  if (!key || String(key).length < 7) return String(key);
  const [y, m] = String(key).split('-');
  return `${m}.${y}`;
};

function timeSeriesForGroup(data, group) {
  if (group === 'day') {
    return (data.byDay || []).map((x) => ({
      x: x.day ? String(x.day).slice(5) : '—',
      count: x.count,
      sumRub: x.sumRub,
      weightGross: x.weightGross,
      weightNet: x.weightNet,
    }));
  }
  if (group === 'week') {
    return (data.byWeek || []).map((x) => ({
      x: weekLabel(x.key),
      count: x.count,
      sumRub: x.sumRub,
      weightGross: x.weightGross,
      weightNet: x.weightNet,
    }));
  }
  return (data.byMonth || []).map((x) => ({
    x: monthLabel(x.key),
    count: x.count,
    sumRub: x.sumRub,
    weightGross: x.weightGross,
    weightNet: x.weightNet,
  }));
}

function groupLabelRu(gg) {
  if (gg === 'week') return 'неделям';
  if (gg === 'month') return 'месяцам';
  return 'дням';
}

const SECTION_KEYS = ['summary', 'operators', 'probe', 'series'];

/**
 * @param {string|undefined} query
 */
export function parseAnalyticsPdfSectionsQuery(query) {
  const str = query == null || query === '' ? '' : String(query).trim();
  if (!str) {
    return { summary: true, operators: true, probe: true, series: true };
  }
  const pick = new Set();
  for (const p of str.split(/[,+]/)) {
    const s = p.trim().toLowerCase();
    if (SECTION_KEYS.includes(s)) pick.add(s);
  }
  if (pick.size === 0) {
    return { summary: true, operators: true, probe: true, series: true };
  }
  return {
    summary: pick.has('summary'),
    operators: pick.has('operators'),
    probe: pick.has('probe'),
    series: pick.has('series'),
  };
}

function b64Png(buf) {
  if (!buf || !buf.length) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** A4 ширина в pt минус симметричные поля — одна линия для таблиц и графиков. */
const PAGE_MARGIN_X = 40;
const CONTENT_W = Math.round(595.28 - 2 * PAGE_MARGIN_X);

const pdfTableLayoutKpi = {
  hLineWidth(i, node) {
    if (i === 0 || i === node.table.body.length) return 0.85;
    return 0.4;
  },
  vLineWidth(i, node) {
    if (i === 0 || i === node.table.widths.length) return 0.85;
    return 0.4;
  },
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  hLineColor: () => '#c9c0b4',
  vLineColor: () => '#c9c0b4',
  fillColor: (i) => (i % 2 === 0 ? '#f4f0e8' : '#faf8f4'),
};

const pdfTableLayoutData = {
  hLineWidth(i, node) {
    if (i === 0 || i === node.table.body.length) return 0.85;
    return 0.35;
  },
  vLineWidth(i, node) {
    if (i === 0 || i === node.table.widths.length) return 0.85;
    return 0.35;
  },
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  hLineColor: () => '#c9c0b4',
  vLineColor: () => '#c9c0b4',
  fillColor: (i) => {
    if (i === 0) return '#ebe4d8';
    return i % 2 === 1 ? '#faf8f4' : '#f4f0e8';
  },
};

const th = (text, opt = {}) => ({ text, fillColor: '#e3dcd0', bold: true, fontSize: 7.5, color: '#2a2420', ...opt });

/** Таблица на всю ширину контентной области (как графики). */
function fullWidthTable(table, layout, margin = [0, 0, 0, 12]) {
  return {
    width: '*',
    table,
    layout,
    margin,
  };
}

/**
 * @param {object} data
 * @param {string} group
 * @param {string} [sectionsQuery]
 */
export async function buildAnalyticsReportPdfBuffer(data, group = 'day', sectionsQuery) {
  let s = parseAnalyticsPdfSectionsQuery(sectionsQuery);
  if (!s.summary && !s.operators && !s.probe && !s.series) {
    s = { summary: true, operators: true, probe: true, series: true };
  }

  const g = group === 'week' || group === 'month' ? group : 'day';
  const nowStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = data.period || {};
  const t = data.totals;
  const byOp = Array.isArray(data.byOperator) ? data.byOperator : [];
  const byProbe = Array.isArray(data.byProbe) ? data.byProbe : [];
  const series = timeSeriesForGroup(data, g);
  const agg = groupLabelRu(g);

  const chartW = CONTENT_W;
  const chartH = 198;
  const bufBar =
    s.probe && byProbe.length > 0
      ? await renderBarChartPng({ rows: byProbe, width: chartW * 2, height: chartH * 2 })
      : null;
  const bufMoney =
    s.series && series.length > 0
      ? await renderLineChartPng({
          width: chartW * 2,
          height: chartH * 2,
          labels: series.map((r) => r.x),
          values: series.map((r) => (Number.isFinite(r.sumRub) ? r.sumRub : 0)),
          caption: `Денежный поток, ₽ (по ${agg})`,
          yUnit: '₽',
          color: '#b8860b',
          isCurrency: true,
        })
      : null;
  const bufW =
    s.series && series.length > 0
      ? await renderDualLineChartPng({
          width: chartW * 2,
          height: chartH * 2,
          labels: series.map((r) => r.x),
          a: series.map((r) => (r.weightGross != null ? Number(r.weightGross) : 0)),
          b: series.map((r) => (r.weightNet != null ? Number(r.weightNet) : 0)),
        })
      : null;

  const images = {};
  if (b64Png(bufBar)) images.gBar = b64Png(bufBar);
  if (b64Png(bufMoney)) images.gMon = b64Png(bufMoney);
  if (b64Png(bufW)) images.gWet = b64Png(bufW);

  const content = [];

  content.push({
    stack: [
      { text: 'ОТЧЁТ ПО АНАЛИТИКЕ', style: 'reportTitle', margin: [0, 0, 0, 4] },
      {
        text: `${fmtDateRu(p.from)}  —  ${fmtDateRu(p.to)}`,
        style: 'reportSub',
        margin: [0, 0, 0, 3],
      },
      { text: 'Calculated Gold  ·  скупка лома (по сделкам с PDF в «Договоре»)', style: 'brandLine', margin: [0, 0, 0, 2] },
      { text: `сформировано: ${nowStr}`, style: 'muted' },
    ],
    margin: [0, 0, 0, 10],
  });
  content.push({
    text:
      'Сделка создаётся при скачивании договора. Сотрудник — e-mail, кто скачал PDF. По пробе, весу — первая строка таблицы (до 3 позиций).',
    style: 'hint',
    margin: [0, 0, 0, 10],
  });

  if (!t || t.deals === 0) {
    content.push({ text: 'За выбранный период нет сделок.', style: 'body' });
  } else {
    if (s.summary) {
      const wg = t.firstRowWeightGrossSum != null ? fmtNum(t.firstRowWeightGrossSum, 2) : '—';
      const wn = t.firstRowWeightNetSum != null ? fmtNum(t.firstRowWeightNetSum, 3) : '—';
      const kpiBody = [
        ['СДЕЛОК', String(t.deals), 'СУММА', fmtRub(t.sumRub)],
        ['КЛИЕНТОВ (УНИК.)', String(t.uniqueCustomers), 'ВЕС 1‑Й СТРОКИ (ЛОМ / ЧИСТ., Г)', `${wg}  /  ${wn}`],
      ];
      const cardRow = (a, b, c, d) => [
        { text: a, style: 'kpiLab', alignment: 'left' },
        { text: b, style: 'kpiVal', alignment: 'right' },
        { text: c, style: 'kpiLab', alignment: 'left' },
        { text: d, style: 'kpiVal', alignment: 'right' },
      ];
      content.push(
        fullWidthTable(
          {
            widths: ['25%', '25%', '25%', '25%'],
            body: [cardRow(...kpiBody[0]), cardRow(...kpiBody[1])],
          },
          pdfTableLayoutKpi,
          [0, 0, 0, 12]
        )
      );
    }
  }

  if (t && t.deals > 0) {
    /* Сначала динамика (графики), затем сотрудники и пробы — плотнее по страницам, без принудительного разрыва после KPI */
    if (s.series && series.length > 0) {
      content.push(
        { text: 'ДИНАМИКА ПО ПЕРИОДУ (АГРЕГАЦИЯ ПО ' + groupLabelRu(g).toUpperCase() + ')', style: 'sectionHead', margin: [0, 0, 0, 3] },
        {
          text: 'График сумм и веса (1-я строка договора) по выбранной группировке — как на экране «Аналитика».',
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        }
      );
      if (images.gMon) {
        content.push({ text: 'Денежный поток', style: 'chartName', margin: [0, 0, 0, 4] });
        content.push({ image: 'gMon', width: chartW, margin: [0, 0, 0, 6] });
        const sumP = series.reduce((a, r) => a + (Number(r.sumRub) || 0), 0);
        const avgD = (sumP / (series.length || 1)) || 0;
        content.push({
          text: `Итого за период: ${fmtRub(t.sumRub)}. Ср. сделка: ${fmtRub(t.deals ? t.sumRub / t.deals : 0)}. Ср. по сегментам: ${fmtRub(avgD)} (${agg}).`,
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        });
      }
      if (images.gWet) {
        content.push({ text: 'Вес (первая строка)', style: 'chartName', margin: [0, 4, 0, 4] });
        content.push({ image: 'gWet', width: chartW, margin: [0, 0, 0, 6] });
        const wg0 = t.firstRowWeightGrossSum != null ? Number(t.firstRowWeightGrossSum) : 0;
        const wn0 = t.firstRowWeightNetSum != null ? Number(t.firstRowWeightNetSum) : 0;
        content.push({
          text: `Суммарно за период (1-я позиция): бр. ${fmtNum(wg0, 2)} г, чист. ${fmtNum(wn0, 3)} г.`,
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        });
      }
      content.push({ text: 'Свод по сегментам', style: 'tableCaption', margin: [0, 2, 0, 5] });
      const tsBody = [
        [th('Период'), th('Сделок', { alignment: 'right' }), th('Сумма, ₽', { alignment: 'right' }), th('Бр., г', { alignment: 'right' }), th('Чист., г', { alignment: 'right' })],
        ...series.map((r) => [
          { text: r.x, fontSize: 8, color: '#1c1917' },
          { text: String(r.count), fontSize: 8, alignment: 'right' },
          { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
          { text: r.weightGross != null ? fmtNum(r.weightGross, 2) : '—', fontSize: 8, alignment: 'right' },
          { text: r.weightNet != null ? fmtNum(r.weightNet, 3) : '—', fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push(
        fullWidthTable(
          {
            widths: ['*', 'auto', '*', '*', '*'],
            body: tsBody,
          },
          pdfTableLayoutData,
          [0, 0, 0, 12]
        )
      );
    }

    if (s.operators && byOp.length > 0) {
      content.push(
        { text: 'СОТРУДНИКИ (КТО СКАЧАЛ PDF ПО СДЕЛКЕ)', style: 'sectionHead', margin: [0, 10, 0, 3] },
        { text: 'E-mail в строке. Без сделки в учёт: «без учётки».', style: 'sectionDesc', margin: [0, 0, 0, 6] }
      );
      const opBody = [
        [th('Учёт / e-mail'), th('Сделок', { alignment: 'right' }), th('Сумма', { alignment: 'right' })],
        ...byOp.map((r) => [
          { text: r.email || '—', fontSize: 8, color: '#1c1917' },
          { text: String(r.deals), fontSize: 8, alignment: 'right' },
          { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push(
        fullWidthTable(
          {
            widths: ['*', 'auto', '*'],
            body: opBody,
          },
          pdfTableLayoutData,
          [0, 0, 0, 12]
        )
      );
    }

    if (s.probe && byProbe.length > 0) {
      content.push(
        { text: 'СДЕЛОК ПО ПРОБЕ (ПЕРВАЯ СТРОКА В ДОГОВОРЕ)', style: 'sectionHead', margin: [0, 10, 0, 3] },
        {
          text: 'Сколько сделок, суммарный вес 1-й позиции (лом / чист., г) и стоимость сделок по этой пробе в периоде.',
          style: 'sectionDesc',
          margin: [0, 0, 0, 6],
        }
      );
      if (images.gBar) {
        content.push({ image: 'gBar', width: chartW, margin: [0, 0, 0, 8] });
      }
      const probeW = (r) => {
        const gN = Number(r?.weightGrossSum);
        const nN = Number(r?.weightNetSum);
        const g = Number.isFinite(gN) ? fmtNum(gN, 2) : '—';
        const n = Number.isFinite(nN) ? fmtNum(nN, 3) : '—';
        return { text: `${g} / ${n}`, fontSize: 8, alignment: 'right' };
      };
      const pbBody = [
        [th('Проба'), th('Сделок', { alignment: 'right' }), th('Вес, г (лом/чист.)', { alignment: 'right' }), th('Сумма, ₽', { alignment: 'right' })],
        ...byProbe.map((r) => [
          { text: `${r.probe} пр.`, fontSize: 8, color: '#1c1917' },
          { text: String(r.count), fontSize: 8, alignment: 'right' },
          probeW(r),
          { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push(
        fullWidthTable(
          {
            widths: ['auto', 'auto', '*', '*'],
            body: pbBody,
          },
          pdfTableLayoutData,
          [0, 0, 0, 10]
        )
      );
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, 42, PAGE_MARGIN_X, 50],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#1c1917' },
    styles: {
      reportTitle: { fontSize: 17, bold: true, color: '#0f0d0a', characterSpacing: 0.15 },
      reportSub: { fontSize: 11, color: '#3d3830' },
      brandLine: { fontSize: 8, color: '#6b5a2e' },
      kpiLab: { fontSize: 7, color: '#5c5348' },
      kpiVal: { fontSize: 10, bold: true, color: '#8a6d1b' },
      body: { fontSize: 9.5, color: '#1c1917' },
      muted: { fontSize: 7.2, color: '#6b655a' },
      hint: { fontSize: 7, color: '#5c5650', lineHeight: 1.25 },
      sectionHead: { fontSize: 9, bold: true, color: '#0f0d0a', lineHeight: 1.2 },
      sectionDesc: { fontSize: 7, color: '#4a4440', lineHeight: 1.3 },
      chartName: { fontSize: 8, bold: true, color: '#2a2018' },
      tableCaption: { fontSize: 7.5, bold: true, color: '#5c5348' },
    },
    footer: (cur, tot) => ({
      margin: [PAGE_MARGIN_X, 6, PAGE_MARGIN_X, 0],
      columns: [
        { text: 'Calculated Gold · аналитика', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content,
  };

  if (Object.keys(images).length) docDefinition.images = images;
  return pdfMake.createPdf(docDefinition).getBuffer();
}
