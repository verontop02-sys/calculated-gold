import { createRequire } from 'module';
import { dirname, join } from 'path';
import { renderLineChartPng, renderDualLineChartPng, renderBarChartPng } from './analyticsChartCanvas.js';
import { getReportLogoDataUri } from './reportLogo.js';

const require = createRequire(import.meta.url);
const pdfMake = require('pdfmake');
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));

// Палитра отчёта (Stage 7): фирменный красный + нейтральные серые.
const C = {
  accent: '#fe0000',
  accentDim: '#c40000',
  ink: '#1a1c1e',
  inkSoft: '#3d3830',
  muted: '#5c636b',
  hairline: '#dde0e3',
  headFill: '#f8ecec',
  rowEven: '#f7f8f9',
  rowOdd: '#ffffff',
  thFill: '#f0e8e8',
};

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

/** A4 ландшафт: ширина в pt минус симметричные поля — дашборд в две колонки. */
const PAGE_MARGIN_X = 32;
const PAGE_W_LANDSCAPE = 841.89;
const CONTENT_W = Math.round(PAGE_W_LANDSCAPE - 2 * PAGE_MARGIN_X);
const COL_GAP = 18;
const HALF_W = Math.round((CONTENT_W - COL_GAP) / 2);

const pdfTableLayoutKpi = {
  hLineWidth(i, node) {
    if (i === 0 || i === node.table.body.length) return 1;
    return 0.4;
  },
  vLineWidth() { return 0; },
  paddingLeft: () => 12,
  paddingRight: () => 12,
  paddingTop: () => 9,
  paddingBottom: () => 9,
  hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? C.accent : C.hairline),
  fillColor: (i) => (i % 2 === 0 ? C.headFill : C.rowOdd),
};

const pdfTableLayoutData = {
  hLineWidth(i, node) {
    if (i === 0 || i === node.table.body.length) return 0.8;
    return 0.35;
  },
  vLineWidth() { return 0; },
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 5,
  paddingBottom: () => 5,
  hLineColor: () => C.hairline,
  fillColor: (i) => {
    if (i === 0) return C.thFill;
    return i % 2 === 1 ? C.rowOdd : C.rowEven;
  },
};

const th = (text, opt = {}) => ({ text, fillColor: C.thFill, bold: true, fontSize: 7.5, color: C.accentDim, ...opt });

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

  // Ландшафт: графики половинной ширины, чтобы вставали по два в ряд (дашборд).
  // По высоте ландшафт уже портрета, поэтому графики делаем ниже и шире.
  const chartW = HALF_W;
  const chartH = 138;
  const bufBar =
    s.probe && byProbe.length > 0
      ? await renderBarChartPng({ rows: byProbe, width: CONTENT_W * 2, height: 132 * 2 })
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
          color: C.accent,
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

  const LOGO_DATA_URI = await getReportLogoDataUri();
  const images = {};
  if (LOGO_DATA_URI) images.brandLogo = LOGO_DATA_URI;
  if (b64Png(bufBar)) images.gBar = b64Png(bufBar);
  if (b64Png(bufMoney)) images.gMon = b64Png(bufMoney);
  if (b64Png(bufW)) images.gWet = b64Png(bufW);

  const content = [];

  const headerStack = {
    width: '*',
    stack: [
      { text: 'ОТЧЁТ ПО АНАЛИТИКЕ', style: 'reportTitle', margin: [0, 0, 0, 4] },
      {
        text: `${fmtDateRu(p.from)}  —  ${fmtDateRu(p.to)}`,
        style: 'reportSub',
        margin: [0, 0, 0, 3],
      },
      { text: 'REAKTIVO PRO  ·  скупка лома (по сделкам с PDF в «Договоре»)', style: 'brandLine', margin: [0, 0, 0, 2] },
      { text: `сформировано: ${nowStr}`, style: 'muted' },
    ],
  };

  content.push({
    columns: LOGO_DATA_URI
      ? [
          headerStack,
          { width: 'auto', image: 'brandLogo', fit: [120, 44], alignment: 'right', margin: [0, 2, 0, 0] },
        ]
      : [headerStack],
    columnGap: 12,
    margin: [0, 0, 0, 6],
  });
  // Акцентная линия-разделитель под шапкой.
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 2, lineColor: C.accent }],
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

      // Каналы: отделение vs доставка.
      const ch = data.channels;
      if (ch && (ch.office || ch.delivery)) {
        const off = ch.office || { deals: 0, sumRub: 0 };
        const del = ch.delivery || { deals: 0, sumRub: 0 };
        content.push({ text: 'КАНАЛЫ ОФОРМЛЕНИЯ', style: 'sectionHead', margin: [0, 0, 0, 6] });
        content.push(
          fullWidthTable(
            {
              widths: ['*', 'auto', 'auto'],
              body: [
                [th('Канал'), th('Сделок', { alignment: 'right' }), th('Сумма', { alignment: 'right' })],
                [
                  { text: 'В отделении', fontSize: 8.5, color: C.ink },
                  { text: String(off.deals), fontSize: 8.5, alignment: 'right' },
                  { text: fmtRub(off.sumRub), fontSize: 8.5, alignment: 'right' },
                ],
                [
                  { text: 'Доставка / курьер', fontSize: 8.5, color: C.ink },
                  { text: String(del.deals), fontSize: 8.5, alignment: 'right' },
                  { text: fmtRub(del.sumRub), fontSize: 8.5, alignment: 'right' },
                ],
              ],
            },
            pdfTableLayoutData,
            [0, 0, 0, 12]
          )
        );
      }
    }
  }

  if (t && t.deals > 0) {
    /* Ландшафт-дашборд: графики по два в ряд, таблицы — широкие. */

    // Ряд 1: денежный поток + вес (два графика рядом).
    if (s.series && series.length > 0 && (images.gMon || images.gWet)) {
      const sumP = series.reduce((a, r) => a + (Number(r.sumRub) || 0), 0);
      const avgD = (sumP / (series.length || 1)) || 0;
      const wg0 = t.firstRowWeightGrossSum != null ? Number(t.firstRowWeightGrossSum) : 0;
      const wn0 = t.firstRowWeightNetSum != null ? Number(t.firstRowWeightNetSum) : 0;

      content.push({
        text: 'ДИНАМИКА ПО ПЕРИОДУ (АГРЕГАЦИЯ ПО ' + groupLabelRu(g).toUpperCase() + ')',
        style: 'sectionHead',
        margin: [0, 0, 0, 6],
      });
      content.push({
        columnGap: COL_GAP,
        columns: [
          {
            width: '*',
            stack: images.gMon
              ? [
                  { text: 'Денежный поток', style: 'chartName', margin: [0, 0, 0, 4] },
                  { image: 'gMon', width: chartW, margin: [0, 0, 0, 4] },
                  {
                    text: `Итого: ${fmtRub(t.sumRub)} · ср. сделка ${fmtRub(t.deals ? t.sumRub / t.deals : 0)} · ср. ${fmtRub(avgD)} (${agg})`,
                    style: 'sectionDesc',
                  },
                ]
              : [{ text: '' }],
          },
          {
            width: '*',
            stack: images.gWet
              ? [
                  { text: 'Вес (первая строка)', style: 'chartName', margin: [0, 0, 0, 4] },
                  { image: 'gWet', width: chartW, margin: [0, 0, 0, 4] },
                  {
                    text: `Суммарно: бр. ${fmtNum(wg0, 2)} г · чист. ${fmtNum(wn0, 3)} г`,
                    style: 'sectionDesc',
                  },
                ]
              : [{ text: '' }],
          },
        ],
        margin: [0, 0, 0, 14],
      });
    }

    // Ряд 2: проба — диаграмма на всю ширину + таблица.
    if (s.probe && byProbe.length > 0) {
      const probeW = (r) => {
        const gN = Number(r?.weightGrossSum);
        const nN = Number(r?.weightNetSum);
        const gg = Number.isFinite(gN) ? fmtNum(gN, 2) : '—';
        const nn = Number.isFinite(nN) ? fmtNum(nN, 3) : '—';
        return { text: `${gg} / ${nn}`, fontSize: 8, alignment: 'right' };
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
      content.push({ text: 'СДЕЛОК ПО ПРОБЕ (ПЕРВАЯ СТРОКА В ДОГОВОРЕ)', style: 'sectionHead', margin: [0, 0, 0, 6] });
      if (images.gBar) {
        content.push({ image: 'gBar', width: CONTENT_W, fit: [CONTENT_W, 132], margin: [0, 0, 0, 6] });
      }
      content.push(
        fullWidthTable({ widths: ['auto', 'auto', '*', '*'], body: pbBody }, pdfTableLayoutData, [0, 0, 0, 14])
      );
    }

    // Ряд 3: сотрудники — широкая таблица (переносится по страницам аккуратно).
    if (s.operators && byOp.length > 0) {
      const opBody = [
        [th('Учёт / e-mail'), th('Сделок', { alignment: 'right' }), th('Сумма', { alignment: 'right' })],
        ...byOp.map((r) => [
          { text: r.email || '—', fontSize: 8, color: '#1c1917' },
          { text: String(r.deals), fontSize: 8, alignment: 'right' },
          { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push({ text: 'СОТРУДНИКИ (КТО СКАЧАЛ PDF)', style: 'sectionHead', margin: [0, 0, 0, 6] });
      content.push(
        fullWidthTable({ widths: ['*', 'auto', 'auto'], body: opBody }, pdfTableLayoutData, [0, 0, 0, 12])
      );
    }

    // Ряд 4: свод по сегментам — широкая таблица.
    if (s.series && series.length > 0) {
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
      content.push({ text: 'СВОД ПО СЕГМЕНТАМ', style: 'sectionHead', margin: [0, 0, 0, 6] });
      content.push(
        fullWidthTable({ widths: ['*', 'auto', '*', '*', '*'], body: tsBody }, pdfTableLayoutData, [0, 0, 0, 8])
      );
    }
  }

  // Убираем нижний отступ у последнего блока — иначе pdfmake иногда добавляет пустую страницу.
  const lastNode = content[content.length - 1];
  if (lastNode && Array.isArray(lastNode.margin)) {
    lastNode.margin = [lastNode.margin[0], lastNode.margin[1], lastNode.margin[2], 0];
  }

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [PAGE_MARGIN_X, 34, PAGE_MARGIN_X, 32],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: C.ink },
    styles: {
      reportTitle: { fontSize: 17, bold: true, color: C.ink, characterSpacing: 0.15 },
      reportSub: { fontSize: 11, color: C.inkSoft },
      brandLine: { fontSize: 8, color: C.accentDim },
      kpiLab: { fontSize: 7, color: C.muted },
      kpiVal: { fontSize: 10, bold: true, color: C.accent },
      body: { fontSize: 9.5, color: C.ink },
      muted: { fontSize: 7.2, color: C.muted },
      hint: { fontSize: 7, color: C.muted, lineHeight: 1.25 },
      sectionHead: { fontSize: 9, bold: true, color: C.ink, lineHeight: 1.2 },
      sectionDesc: { fontSize: 7, color: C.inkSoft, lineHeight: 1.3 },
      chartName: { fontSize: 8, bold: true, color: C.accentDim },
      tableCaption: { fontSize: 7.5, bold: true, color: C.muted },
    },
    footer: (cur, tot) => ({
      margin: [PAGE_MARGIN_X, 6, PAGE_MARGIN_X, 0],
      columns: [
        { text: 'REAKTIVO PRO · аналитика', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content,
  };

  if (Object.keys(images).length) docDefinition.images = images;
  return pdfMake.createPdf(docDefinition).getBuffer();
}
