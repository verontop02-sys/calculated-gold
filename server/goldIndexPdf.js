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

const fmtRatio = (n) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const PAGE_MARGIN_X = 40;

/** overview — результат buildGoldIndexOverview */
export function buildGoldIndexReportPdfBuffer(overview) {
  const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const spot = overview?.goldRubPerGram != null ? fmtRub(overview.goldRubPerGram) : '—';
  const bb = overview?.settingsSnapshot?.buybackPercentOfScrap ?? '—';

  const regionRows = [
    [{ text: 'Регион', style: 'th' }, { text: 'Городов', style: 'th' }, { text: 'Индекс ср.', style: 'th' }],
    ...(overview?.regions || []).map((r) => [
      String(r.regionName || ''),
      String(r.cityCount ?? ''),
      fmtRatio(r.ratioAvg),
    ]),
  ];

  const cityBlocks = [];
  for (const c of overview?.cities || []) {
    cityBlocks.push({
      text: `${c.region_name || ''} · ${c.city_name || ''}`,
      style: 'cityHead',
      margin: [0, 10, 0, 4],
    });
    cityBlocks.push({
      text: `Координаты: ${c.lat?.toFixed?.(4) ?? c.lat}, ${c.lng?.toFixed?.(4) ?? c.lng} · Население: ${c.population ?? '—'} · Индекс города: ${fmtRatio(c.ratioAvg)}`,
      style: 'small',
      margin: [0, 0, 0, 6],
    });
    const compRows = [
      [
        { text: 'Компания', style: 'th' },
        { text: 'Индекс', style: 'th' },
        { text: 'Пробы (₽/г)', style: 'th' },
      ],
    ];
    for (const co of c.competitors || []) {
      const probesStr = Object.entries(co.probes || {})
        .map(([k, v]) => `${k}: ${fmtRub(typeof v === 'number' ? v : parseFloat(v))}`)
        .join('; ');
      compRows.push([
        String(co.companyName || ''),
        fmtRatio(co.ratioAvg),
        probesStr || '—',
      ]);
    }
    if (compRows.length === 1) {
      compRows.push(['—', '—', 'Нет конкурентов']);
    }
    cityBlocks.push({
      table: {
        widths: ['*', 55, '*'],
        body: compRows,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 6],
    });
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, 50, PAGE_MARGIN_X, 46],
    styles: {
      header: { fontSize: 16, bold: true, color: '#1a1510' },
      sub: { fontSize: 9, color: '#5c5348', margin: [0, 4, 0, 12] },
      cityHead: { fontSize: 11, bold: true, color: '#2a2018' },
      small: { fontSize: 8, color: '#5c5348' },
      th: { bold: true, fillColor: '#f5f1ea', fontSize: 8 },
    },
    footer: (cur, tot) => ({
      margin: [PAGE_MARGIN_X, 6, PAGE_MARGIN_X, 0],
      columns: [
        { text: 'REAKTIVO PRO · индекс золота', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content: [
      { text: 'Индекс золота', style: 'header' },
      {
        text: `Сформировано: ${generated} · Биржа (эталон): ${spot} · Выкуп лома: ${bb}%`,
        style: 'sub',
      },
      {
        text: 'Сводка по регионам',
        fontSize: 10,
        bold: true,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          widths: ['*', 50, 70],
          body: regionRows,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 14],
      },
      { text: 'Города и конкуренты', fontSize: 10, bold: true, margin: [0, 0, 0, 6] },
      ...cityBlocks,
    ],
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}
