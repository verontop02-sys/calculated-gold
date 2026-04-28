import { createRequire } from 'module';
import { dirname, join } from 'path';

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
    content.push({
      table: {
        widths: ['*', 100, '*', 100],
        body: [
          [
            { text: 'СДЕЛОК', style: 'kpiLab' },
            { text: String(t.deals), style: 'kpiVal' },
            { text: 'СУММА', style: 'kpiLab' },
            { text: fmtRub(t.sumRub), style: 'kpiVal' },
          ],
          [
            { text: 'ВЕС ЛОМ, Г', style: 'kpiLab' },
            { text: wg, style: 'kpiVal' },
            { text: 'ВЕС ЧИСТ., Г', style: 'kpiLab' },
            { text: wn, style: 'kpiVal' },
          ],
        ],
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
      {
        table: { widths: [22, '*', 34, 56, 72, 34], body: opBody },
        layout: {
          fillColor: (i) => (i > 0 && i % 2 ? '#faf7f0' : null),
          hLineColor: () => '#e0dcd4',
          vLineColor: () => '#e0dcd4',
        },
        margin: [0, 0, 0, 14],
      }
    );

    if (weeks.length > 0) {
      const wBody = [
        [th('Неделя с'), th('Сделок', { alignment: 'right' }), th('Сумма', { alignment: 'right' }), th('Вес лом', { alignment: 'right' }), th('Вес чист.', { alignment: 'right' })],
        ...weeks.map((w) => [
          { text: fmtDateRu(w.weekStart), fontSize: 8 },
          { text: String(w.deals), fontSize: 8, alignment: 'right' },
          { text: fmtRub(w.sumRub), fontSize: 8, alignment: 'right' },
          { text: fmtNum(w.weightGrossSum, 2), fontSize: 8, alignment: 'right' },
          { text: fmtNum(w.weightNetSum, 3), fontSize: 8, alignment: 'right' },
        ]),
      ];
      content.push(
        { text: 'ПО НЕДЕЛЯМ (ISO)', style: 'sectionHead', margin: [0, 4, 0, 4] },
        {
          table: { widths: [56, 34, 56, 46, 46], body: wBody },
          layout: {
            fillColor: (i) => (i > 0 && i % 2 ? '#faf7f0' : null),
            hLineColor: () => '#e0dcd4',
            vLineColor: () => '#e0dcd4',
          },
          margin: [0, 0, 0, 8],
        }
      );
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#1c1917' },
    styles: {
      reportTitle: { fontSize: 17, bold: true, color: '#0f0d0a', characterSpacing: 0.2 },
      reportSub: { fontSize: 11, color: '#3d3830' },
      body: { fontSize: 9.5, color: '#1c1917' },
      muted: { fontSize: 7.2, color: '#6b655a' },
      hint: { fontSize: 7, color: '#5c5650' },
      sectionHead: { fontSize: 9, bold: true, color: '#0f0d0a' },
      kpiLab: { fontSize: 7, color: '#5c5348' },
      kpiVal: { fontSize: 10, bold: true, color: '#8a6d1b' },
    },
    footer: (cur, tot) => ({
      margin: [40, 4, 40, 0],
      columns: [
        { text: 'Calculated Gold · команда и KPI', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content,
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}
