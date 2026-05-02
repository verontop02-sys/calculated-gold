import { createRequire } from 'module';
import { dirname, join } from 'path';
import { renderLineChartPng } from './analyticsChartCanvas.js';

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

const th = (text, opt = {}) => ({ text, fillColor: '#e8e4dd', bold: true, fontSize: 7.5, color: '#2a2420', ...opt });

/** A4 контентная ширина (pt) — как в аналитике: графики и таблицы на одну линию. */
const PAGE_MARGIN_X = 40;
const CONTENT_W = Math.round(595.28 - 2 * PAGE_MARGIN_X);

function b64Png(buf) {
  if (!buf || !buf.length) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

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

function fullWidthTable(table, layout, margin = [0, 0, 0, 12]) {
  return {
    width: '*',
    table,
    layout,
    margin,
  };
}

/** Сумма ₽ по календарному дню (все сотрудники в выборке). */
function dailyTurnoverSeries(dailyRows) {
  const m = new Map();
  for (const r of dailyRows || []) {
    const day = r.day ? String(r.day).slice(0, 10) : '';
    if (!day) continue;
    m.set(day, (m.get(day) || 0) + (Number(r.sumRub) || 0));
  }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([day]) => {
    const tail = day.slice(5);
    return tail.replace('-', '.');
  });
  const values = sorted.map(([, sum]) => sum);
  return { labels, values };
}

function weekSumDeltaCell(prev, cur) {
  if (!prev) return { text: '—', fontSize: 7.5, alignment: 'right', color: '#6b655a' };
  const c = Number(cur?.sumRub) || 0;
  const p = Number(prev?.sumRub) || 0;
  if (p <= 0) {
    return { text: c > 0 ? 'нов.' : '—', fontSize: 7.5, alignment: 'right', color: '#6b655a' };
  }
  const pct = Math.round(((c - p) / p) * 1000) / 10;
  const sign = pct > 0 ? '+' : '';
  let color = '#1c1917';
  if (pct > 0.5) color = '#166534';
  else if (pct < -0.5) color = '#b45309';
  return { text: `${sign}${pct}%`, fontSize: 7.5, alignment: 'right', color };
}

/**
 * @param {Awaited<ReturnType<import('./teamPerformanceData.js').computeTeamPerformanceData>>} data
 */
export async function buildTeamPerformancePdfBuffer(data) {
  const nowStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = data.period || {};
  const t = data.totals;
  const ops = Array.isArray(data.operators) ? data.operators : [];
  const weeks = Array.isArray(data.byWeek) ? data.byWeek : [];
  const dailyRows = Array.isArray(data.dailyRows) ? data.dailyRows : [];

  const chartW = CONTENT_W;
  const chartH = 198;
  const { labels: dayLabels, values: dayValues } = dailyTurnoverSeries(dailyRows);
  const weekLabels = weeks.map((w) => {
    const s = String(w.weekStart || '').slice(0, 10);
    const [y, mo, d] = s.split('-');
    return y && mo && d ? `${d}.${mo}` : fmtDateRu(w.weekStart);
  });
  const weekValues = weeks.map((w) => Number(w.sumRub) || 0);

  const [bufDaily, bufWeek] = await Promise.all([
    dayLabels.length > 0
      ? renderLineChartPng({
          width: chartW * 2,
          height: chartH * 2,
          labels: dayLabels,
          values: dayValues,
          caption: 'Оборот по дням, ₽',
          yUnit: '₽',
          color: '#b8860b',
          isCurrency: true,
        })
      : Promise.resolve(Buffer.alloc(0)),
    weekLabels.length > 0
      ? renderLineChartPng({
          width: chartW * 2,
          height: chartH * 2,
          labels: weekLabels,
          values: weekValues,
          caption: 'Оборот по неделям (ISO, пн), ₽',
          yUnit: '₽',
          color: '#6b5b95',
          fillUnder: true,
          isCurrency: true,
        })
      : Promise.resolve(Buffer.alloc(0)),
  ]);

  const images = {};
  if (b64Png(bufDaily)) images.teamDay = b64Png(bufDaily);
  if (b64Png(bufWeek)) images.teamWeek = b64Png(bufWeek);

  const content = [];

  content.push({
    stack: [
      { text: 'КОМАНДА И KPI (ПО СДЕЛКАМ С PDF)', style: 'reportTitle', margin: [0, 0, 0, 6] },
      {
        text: `${fmtDateRu(p.from)}  —  ${fmtDateRu(p.to)}`,
        style: 'reportSub',
        margin: [0, 0, 0, 4],
      },
      {
        text:
          (data.viewerIsManager
            ? 'Руководитель: видна команда; фильтр сотрудников — как в панели.'
            : 'Только ваши сделки за период.') +
            ' Сделка учитывается после скачивания PDF по договору. Вес — по первой строке таблицы в договоре.',
        style: 'hint',
        margin: [0, 0, 0, 2],
      },
      { text: `сформировано: ${nowStr}`, style: 'muted' },
    ],
    margin: [0, 0, 0, 12],
  });

  if (!t || t.deals === 0) {
    content.push({ text: 'За выбранный период нет сделок по этим фильтрам.', style: 'body' });
  } else {
    const wg = fmtNum(t.weightGrossSum, 2);
    const wn = fmtNum(t.weightNetSum, 3);
    const kpiBody = [
      [
        { text: 'СДЕЛОК', style: 'kpiLab', alignment: 'left' },
        { text: String(t.deals), style: 'kpiVal', alignment: 'right' },
        { text: 'СУММА', style: 'kpiLab', alignment: 'left' },
        { text: fmtRub(t.sumRub), style: 'kpiVal', alignment: 'right' },
      ],
      [
        { text: 'ВЕС ЛОМ, Г', style: 'kpiLab', alignment: 'left' },
        { text: wg, style: 'kpiVal', alignment: 'right' },
        { text: 'ВЕС ЧИСТ., Г', style: 'kpiLab', alignment: 'left' },
        { text: wn, style: 'kpiVal', alignment: 'right' },
      ],
    ];
    content.push(
      fullWidthTable(
        {
          widths: ['25%', '25%', '25%', '25%'],
          body: kpiBody,
        },
        pdfTableLayoutKpi,
        [0, 0, 0, 14]
      )
    );

    if (images.teamDay || images.teamWeek) {
      content.push(
        { text: 'ДИНАМИКА ОБОРОТА', style: 'sectionHead', margin: [0, 4, 0, 3] },
        {
          text: 'Как на экране «Команда и KPI»: по дням и по неделям (неделя с понедельника).',
          style: 'sectionDesc',
          margin: [0, 0, 0, 8],
        }
      );
      if (images.teamDay) {
        content.push({ text: 'По дням', style: 'chartName', margin: [0, 0, 0, 4] });
        content.push({ image: 'teamDay', width: chartW, margin: [0, 0, 0, 10] });
      }
      if (images.teamWeek) {
        content.push({ text: 'По неделям', style: 'chartName', margin: [0, 0, 0, 4] });
        content.push({ image: 'teamWeek', width: chartW, margin: [0, 0, 0, 10] });
      }
    }

    const opBody = [
      [
        th('#'),
        th('Учётная запись'),
        th('Сделок', { alignment: 'right' }),
        th('Сумма', { alignment: 'right' }),
        th('Вес лом / чист., г', { alignment: 'right' }),
        th('% суммы', { alignment: 'right' }),
      ],
      ...ops.map((r) => [
        { text: String(r.rank), fontSize: 8 },
        { text: r.email || '—', fontSize: 8 },
        { text: String(r.deals), fontSize: 8, alignment: 'right' },
        { text: fmtRub(r.sumRub), fontSize: 8, alignment: 'right' },
        {
          text: `${fmtNum(r.weightGrossSum, 2)} / ${fmtNum(r.weightNetSum, 3)}`,
          fontSize: 7.5,
          alignment: 'right',
        },
        { text: `${r.shareRubPct}%`, fontSize: 8, alignment: 'right' },
      ]),
    ];
    content.push(
      { text: 'РЕЙТИНГ ПО СОТРУДНИКАМ', style: 'sectionHead', margin: [0, 6, 0, 4] },
      fullWidthTable(
        {
          widths: [22, '*', 34, 56, 72, 34],
          body: opBody,
        },
        pdfTableLayoutData,
        [0, 0, 0, 14]
      )
    );

    if (weeks.length > 0) {
      const wBody = [
        [
          th('Неделя с'),
          th('Сделок', { alignment: 'right' }),
          th('Сумма', { alignment: 'right' }),
          th('к пред.', { alignment: 'right', fontSize: 6.8 }),
          th('Лом, г', { alignment: 'right' }),
          th('Чист., г', { alignment: 'right' }),
        ],
        ...weeks.map((w, i) => {
          const prev = i > 0 ? weeks[i - 1] : null;
          return [
            { text: fmtDateRu(w.weekStart), fontSize: 8 },
            { text: String(w.deals), fontSize: 8, alignment: 'right' },
            { text: fmtRub(w.sumRub), fontSize: 8, alignment: 'right' },
            weekSumDeltaCell(prev, w),
            { text: fmtNum(w.weightGrossSum, 2), fontSize: 8, alignment: 'right' },
            { text: fmtNum(w.weightNetSum, 3), fontSize: 8, alignment: 'right' },
          ];
        }),
      ];
      content.push(
        { text: 'ПО НЕДЕЛЯМ (ISO, ПН — НАЧАЛО НЕДЕЛИ)', style: 'sectionHead', margin: [0, 4, 0, 2] },
        {
          text: 'Колонка «к пред.» — изменение оборота к предыдущей полной неделе в отчёте (%).',
          style: 'hint',
          margin: [0, 0, 0, 4],
        },
        fullWidthTable(
          {
            widths: [58, 30, '*', 40, 44, 44],
            body: wBody,
          },
          pdfTableLayoutData,
          [0, 0, 0, 8]
        )
      );
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, 40, PAGE_MARGIN_X, 50],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#1c1917' },
    styles: {
      reportTitle: { fontSize: 17, bold: true, color: '#0f0d0a', characterSpacing: 0.2 },
      reportSub: { fontSize: 11, color: '#3d3830' },
      body: { fontSize: 9.5, color: '#1c1917' },
      muted: { fontSize: 7.2, color: '#6b655a' },
      hint: { fontSize: 7, color: '#5c5650' },
      sectionHead: { fontSize: 9, bold: true, color: '#0f0d0a' },
      sectionDesc: { fontSize: 7, color: '#4a4440', lineHeight: 1.3 },
      chartName: { fontSize: 8, bold: true, color: '#2a2018' },
      kpiLab: { fontSize: 7, color: '#5c5348' },
      kpiVal: { fontSize: 10, bold: true, color: '#8a6d1b' },
    },
    footer: (cur, tot) => ({
      margin: [PAGE_MARGIN_X, 4, PAGE_MARGIN_X, 0],
      columns: [
        { text: 'Calculated Gold · команда и KPI', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content,
  };

  if (Object.keys(images).length) docDefinition.images = images;
  return pdfMake.createPdf(docDefinition).getBuffer();
}
