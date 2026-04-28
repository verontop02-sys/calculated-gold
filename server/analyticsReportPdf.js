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

const CHART_W = 502;

const th = (text, opt = {}) => ({ text, fillColor: '#e8e4dd', bold: true, fontSize: 7.5, color: '#2a2420', ...opt });

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

  const bufBar = s.probe && byProbe.length > 0 ? await renderBarChartPng({ rows: byProbe }) : null;
  const bufMoney =
    s.series && series.length > 0
      ? await renderLineChartPng({
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
      { text: 'ОТЧЁТ ПО АНАЛИТИКЕ', style: 'reportTitle', margin: [0, 0, 0, 6] },
      {
        text: `${fmtDateRu(p.from)}  —  ${fmtDateRu(p.to)}`,
        style: 'reportSub',
        margin: [0, 0, 0, 4],
      },
      { text: 'Calculated Gold  ·  скупка лома (по сделкам с PDF в «Договоре»)', style: 'brandLine', margin: [0, 0, 0, 2] },
      { text: `сформировано: ${nowStr}`, style: 'muted' },
    ],
    margin: [0, 0, 0, 12],
  });
  content.push({
    text:
      'Сделка создаётся при скачивании договора. Сотрудник — e-mail, кто скачал PDF. По пробе, весу — первая строка таблицы (до 3 позиций).',
    style: 'hint',
    margin: [0, 0, 0, 10],
  });

  if (!t || t.deals === 0) {
    content.push({ text: 'За выбранный период нет сделок.', style: 'body', pageBreak: 'after' });
  } else {
    if (s.summary) {
      const wg = t.firstRowWeightGrossSum != null ? fmtNum(t.firstRowWeightGrossSum, 2) : '—';
      const wn = t.firstRowWeightNetSum != null ? fmtNum(t.firstRowWeightNetSum, 3) : '—';
      const kpiBody = [
        ['СДЕЛОК', String(t.deals), 'СУММА', fmtRub(t.sumRub)],
        ['КЛИЕНТОВ (УНИК.)', String(t.uniqueCustomers), 'ВЕС 1‑Й СТРОКИ (ЛОМ / ЧИСТ., Г)', `${wg}  /  ${wn}`],
      ];
      const cardRow = (a, b, c, d) => [
        { text: a, style: 'kpiLab' },
        { text: b, style: 'kpiVal' },
        { text: c, style: 'kpiLab' },
        { text: d, style: 'kpiVal' },
      ];
      content.push({
        table: {
          widths: ['*', 120, '*', 120],
          body: [cardRow(...kpiBody[0]), cardRow(...kpiBody[1])],
        },
        layout: {
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          hLineColor: () => '#dcd6cc',
          vLineColor: () => '#dcd6cc',
        },
        margin: [0, 0, 0, 14],
      });
    }
    content.push({ text: '', pageBreak: 'after' });
  }

  if (t && t.deals > 0) {
    if (s.operators && byOp.length > 0) {
      content.push(
        { text: 'СОТРУДНИКИ (КТО СКАЧАЛ PDF ПО СДЕЛКЕ)', style: 'sectionHead', margin: [0, 0, 0, 2] },
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
      content.push({
        table: { widths: ['*', 46, 80], body: opBody },
        layout: {
          fillColor: (i) => (i > 0 && i % 2 ? '#faf7f0' : null),
          hLineColor: () => '#e0dcd4',
          vLineColor: () => '#e0dcd4',
        },
        margin: [0, 0, 0, 18],
      });
    }

    if (s.probe && byProbe.length > 0) {
      content.push(
        { text: 'СДЕЛОК ПО ПРОБЕ (ПЕРВАЯ СТРОКА В ДОГОВОРЕ)', style: 'sectionHead', margin: [0, 6, 0, 2] },
        {
          text: 'Сколько сделок, суммарный вес 1-й позиции (лом / чист., г) и стоимость сделок по этой пробе в периоде.',
          style: 'sectionDesc',
          margin: [0, 0, 0, 6],
        }
      );
      if (images.gBar) {
        content.push({ image: 'gBar', width: CHART_W, alignment: 'center', margin: [0, 0, 0, 8] });
      }
      const probeW = (r) => {
        const gN = Number(r?.weightGrossSum);
        const nN = Number(r?.weightNetSum);
        const g = Number.isFinite(gN) ? fmtNum(gN, 2) : '—';
        const n = Number.isFinite(nN) ? fmtNum(nN, 3) : '—';
        return { text: `${g} / ${n}`, fontSize: 7.5, alignment: 'right' };
      };
      const pbBody = [
        [th('Проба'), th('Сделок', { alignment: 'right' }), th('Вес, г (лом/чист.)', { alignment: 'right' }), th('Сумма, ₽', { alignment: 'right' })],
        ...byProbe.map((r) => [
          { text: `${r.probe} пр.`, fontSize: 8 },
          { text: String(r.count), fontSize: 8, alignment: 'right' },
          probeW(r),
          { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push({
        text: 'Таблица',
        style: 'tableCaption',
        margin: [0, 4, 0, 4],
      });
      content.push({
        table: { widths: [42, 34, 68, 72], body: pbBody },
        layout: { fillColor: (i) => (i > 0 && i % 2 ? '#faf7f0' : null), hLineColor: () => '#e0dcd4' },
        margin: [0, 0, 0, 18],
      });
    }

    if (s.series && series.length > 0) {
      content.push(
        { text: 'ДИНАМИКА ПО ПЕРИОДУ (КАК НА ЭКРАНЕ, АГРЕГАЦИЯ ПО ' + groupLabelRu(g).toUpperCase() + ')', style: 'sectionHead', margin: [0, 6, 0, 2] },
        {
          text: 'График сумм за интервал, затем вес лома (зел.) и чист. массы (фиолет.) в граммах, если данные в договоре.',
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        }
      );
      if (images.gMon) {
        content.push({ text: 'Денежный поток', style: 'chartName', margin: [0, 0, 0, 2] });
        content.push({ image: 'gMon', width: CHART_W, alignment: 'center', margin: [0, 0, 0, 4] });
        const sumP = series.reduce((a, r) => a + (Number(r.sumRub) || 0), 0);
        const avgD = (sumP / (series.length || 1)) || 0;
        content.push({
          text: `Итого за период: ${fmtRub(t.sumRub)}. Ср. сделка: ${fmtRub(t.deals ? t.sumRub / t.deals : 0)}. Ср. ден. потока по сегментам: ${fmtRub(avgD)} (среднее ${agg} на графике).`,
          style: 'sectionDesc',
          margin: [0, 0, 0, 12],
        });
      }
      if (images.gWet) {
        content.push({ text: 'Вес (первая строка)', style: 'chartName', margin: [0, 4, 0, 2] });
        content.push({ image: 'gWet', width: CHART_W, alignment: 'center', margin: [0, 0, 0, 4] });
        const wg0 = t.firstRowWeightGrossSum != null ? Number(t.firstRowWeightGrossSum) : 0;
        const wn0 = t.firstRowWeightNetSum != null ? Number(t.firstRowWeightNetSum) : 0;
        content.push({
          text: `Суммарно за период (1-я позиция): бр. ${fmtNum(wg0, 2)} г, чист. ${fmtNum(wn0, 3)} г.`,
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        });
      }
      content.push({ text: 'Сводные данные по сегментам (таблица)', style: 'tableCaption', margin: [0, 2, 0, 4] });
      const tsBody = [
        [th('Период', { fontSize: 6.5 }), th('Сделок', { alignment: 'right' }), th('Сумма, ₽', { alignment: 'right' }), th('Бр., г', { alignment: 'right' }), th('Чист., г', { alignment: 'right' })],
        ...series.map((r) => [
          { text: r.x, fontSize: 6.5 },
          { text: String(r.count), fontSize: 6.5, alignment: 'right' },
          { text: fmtRub(r.sumRub), fontSize: 6.5, alignment: 'right' },
          { text: r.weightGross != null ? fmtNum(r.weightGross, 2) : '—', fontSize: 6.5, alignment: 'right' },
          { text: r.weightNet != null ? fmtNum(r.weightNet, 3) : '—', fontSize: 6.5, alignment: 'right' },
        ]),
      ];
      content.push({
        table: { widths: [44, 28, 50, 38, 40], body: tsBody },
        layout: { fillColor: (i) => (i > 0 && i % 2 ? '#faf7f0' : null), hLineColor: () => '#e0dcd4' },
        margin: [0, 0, 0, 6],
      });
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#1c1917' },
    styles: {
      reportTitle: { fontSize: 18, bold: true, color: '#0f0d0a', characterSpacing: 0.2 },
      reportSub: { fontSize: 11, color: '#3d3830' },
      brandLine: { fontSize: 8, color: '#6b5a2e' },
      kpiLab: { fontSize: 7, color: '#5c5348' },
      kpiVal: { fontSize: 10, bold: true, color: '#8a6d1b' },
      body: { fontSize: 9.5, color: '#1c1917' },
      muted: { fontSize: 7.2, color: '#6b655a' },
      hint: { fontSize: 7, color: '#5c5650' },
      sectionHead: { fontSize: 9, bold: true, color: '#0f0d0a' },
      sectionDesc: { fontSize: 7, color: '#4a4440' },
      chartName: { fontSize: 8, bold: true, color: '#2a2018' },
      tableCaption: { fontSize: 7, bold: true, color: '#5c5348' },
    },
    footer: (cur, tot) => ({
      margin: [40, 4, 40, 0],
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
