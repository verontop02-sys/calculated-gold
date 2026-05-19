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
export async function buildGoldIndexReportPdfBuffer(overview, options = {}) {
  const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const spot = overview?.goldRubPerGram != null ? fmtRub(overview.goldRubPerGram) : '—';
  const bb = overview?.settingsSnapshot?.buybackPercentOfScrap ?? '—';
  const filters = options?.filters || {};
  const historyRows = Array.isArray(options?.historyRows) ? options.historyRows : [];
  const filtersText = [
    filters.regionName ? `Регион: ${filters.regionName}` : null,
    filters.from || filters.to
      ? `Период истории: ${filters.from || '...'} — ${filters.to || '...'}`
      : 'Период истории: последние изменения',
  ]
    .filter(Boolean)
    .join(' · ');

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
    const bits = [];
    const streetLine = [c.street, c.building].filter(Boolean).join(', ');
    if (streetLine) bits.push(`ул.: ${streetLine}`);
    if (c.address_note) bits.push(`прим.: ${c.address_note}`);
    if (c.geocoded_label) bits.push(String(c.geocoded_label));
    const addrSuffix = bits.length ? ` · ${bits.join(' · ')}` : '';
    cityBlocks.push({
      text: `Координаты: ${c.lat?.toFixed?.(4) ?? c.lat}, ${c.lng?.toFixed?.(4) ?? c.lng} · Население: ${c.population ?? '—'} · Индекс: ${fmtRatio(c.ratioAvg)}${addrSuffix}`,
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
      const addressStr = co.address ? `Адрес: ${co.address}` : 'Адрес: —';
      const commentStr = co.comment || co.notes ? `Комментарий: ${co.comment || co.notes}` : 'Комментарий: —';
      compRows.push([
        `${String(co.companyName || '')}\n${addressStr}\n${commentStr}`,
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

  const historyTableRows = [
    [
      { text: 'Дата / время', style: 'th' },
      { text: 'Тип', style: 'th' },
      { text: 'Действие', style: 'th' },
      { text: 'Объект', style: 'th' },
      { text: 'Кто изменил', style: 'th' },
    ],
  ];
  for (const row of historyRows.slice(0, 120)) {
    const ts = row?.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '—';
    const action =
      row?.action === 'create' ? 'Создание' : row?.action === 'update' ? 'Изменение' : row?.action === 'delete' ? 'Удаление' : '—';
    const payloadCity =
      row?.payload?.city_name ||
      row?.payload?.before?.city_name ||
      row?.payload?.patch?.city_name ||
      row?.payload?.company_name ||
      row?.payload?.before?.company_name ||
      '—';
    const actorName = (row?.changed_by_name || '').trim();
    const actorEmail = (row?.changed_by_email || '').trim();
    const actorCell = actorName || actorEmail
      ? {
          stack: [
            actorName ? { text: actorName, bold: true, fontSize: 7.5 } : null,
            actorEmail ? { text: actorEmail, fontSize: 7, color: '#5c5348' } : null,
          ].filter(Boolean),
        }
      : { text: 'Система', fontSize: 7.5, color: '#5c5348' };
    historyTableRows.push([
      { text: ts, fontSize: 7.5, noWrap: false },
      { text: row?.entity_type === 'city' ? 'Город' : 'Конкурент', fontSize: 7.5 },
      { text: action, fontSize: 7.5 },
      { text: String(payloadCity || '—'), fontSize: 7.5, noWrap: false },
      actorCell,
    ]);
  }
  if (historyTableRows.length === 1) {
    historyTableRows.push([
      { text: '—', fontSize: 7.5 },
      { text: '—', fontSize: 7.5 },
      { text: '—', fontSize: 7.5 },
      { text: 'Нет изменений за выбранный период', fontSize: 7.5, colSpan: 2 },
      {},
    ]);
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, 50, PAGE_MARGIN_X, 46],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: {
      header: { fontSize: 16, bold: true, color: '#1a1510' },
      sub: { fontSize: 9, color: '#5c5348', margin: [0, 4, 0, 10] },
      cityHead: { fontSize: 11, bold: true, color: '#2a2018' },
      small: { fontSize: 8, color: '#5c5348' },
      th: { bold: true, fillColor: '#f5f1ea', fontSize: 7.5, color: '#3a3028' },
      sectionHead: { fontSize: 10, bold: true, color: '#2a2018', margin: [0, 4, 0, 6] },
    },
    footer: (cur, tot) => ({
      margin: [PAGE_MARGIN_X, 6, PAGE_MARGIN_X, 0],
      columns: [
        { text: 'REAKTIVO PRO · Индекс золота', color: '#9a9288', fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: '#9a9288', fontSize: 6.5 },
      ],
    }),
    content: [
      { text: 'Индекс золота', style: 'header' },
      {
        text: `Сформировано: ${generated} · Биржа (эталон): ${spot} · Выкуп лома: ${bb}%`,
        style: 'sub',
      },
      filtersText ? { text: filtersText, style: 'sub', color: '#b8921a' } : null,
      { text: 'Сводка по регионам', style: 'sectionHead' },
      {
        table: {
          widths: ['*', 55, 70],
          body: regionRows,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 14],
      },
      { text: 'Города и конкуренты', style: 'sectionHead' },
      ...cityBlocks,
      { text: 'История изменений', style: 'sectionHead', margin: [0, 12, 0, 6] },
      {
        table: {
          widths: [80, 52, 52, '*', 110],
          body: historyTableRows,
          dontBreakRows: false,
        },
        layout: {
          ...pdfMake.tableLayouts?.lightHorizontalLines,
          hLineWidth: (i) => (i === 0 || i === 1 ? 1 : 0.5),
          hLineColor: () => '#d9d4cc',
          vLineWidth: () => 0,
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },
    ].filter(Boolean),
  };

  const out = await pdfMake.createPdf(docDefinition).getBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
