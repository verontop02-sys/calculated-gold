/**
 * PDF «Индекс золота» (A4 портрет). Единый тёмный стиль из reportTheme.js.
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { getReportLogoDataUri } from './reportLogo.js';
import {
  pickPalette, fmtRub, dataTableLayout, th, sectionTitle, sectionTable, keepTogether, baseDocDefinition,
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

const fmtRatio = (n) =>
  (n == null || !Number.isFinite(n)) ? '—' : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const PAGE_MARGIN_X = 30;
const PAGE_W = 595.28;
const CONTENT_W = Math.round(PAGE_W - 2 * PAGE_MARGIN_X);

/** overview — результат buildGoldIndexOverview */
export async function buildGoldIndexReportPdfBuffer(overview, options = {}) {
  const C = pickPalette(options.theme === 'dark' ? 'dark' : 'light');
  const generated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const spot = overview?.goldRubPerGram != null ? fmtRub(overview.goldRubPerGram) : '—';
  const bb = overview?.settingsSnapshot?.buybackPercentOfScrap ?? '—';
  const filters = options?.filters || {};
  const historyRows = Array.isArray(options?.historyRows) ? options.historyRows : [];
  const logo = await getReportLogoDataUri();

  const filtersText = [
    filters.regionName ? `Регион: ${filters.regionName}` : null,
    filters.from || filters.to
      ? `Период истории: ${filters.from || '...'} — ${filters.to || '...'}`
      : 'Период истории: последние изменения',
  ].filter(Boolean).join(' · ');

  const layout = dataTableLayout(C);
  const tbl = (body, widths, m = [0, 0, 0, 0]) => ({ table: { widths, body }, layout, margin: m });

  const content = [];

  // ── Шапка ──
  const headerCols = [{
    width: '*',
    stack: [
      { text: 'Индекс золота', fontSize: 18, bold: true, color: C.ink, characterSpacing: -0.3 },
      { text: `Сформировано: ${generated}`, fontSize: 8, color: C.inkMuted, margin: [0, 4, 0, 0] },
      { text: `Биржа (эталон): ${spot} · Выкуп лома: ${bb}%`, fontSize: 8, color: C.inkMuted, margin: [0, 2, 0, 0] },
      filtersText ? { text: filtersText, fontSize: 7.5, color: C.accent, margin: [0, 2, 0, 0] } : null,
    ].filter(Boolean),
  }];
  if (logo) headerCols.push({ width: 34, image: 'brandLogo', fit: [34, 34], margin: [10, 0, 0, 0] });
  content.push({ columns: headerCols, columnGap: 12, margin: [0, 0, 0, 8] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.5, lineColor: C.accent }], margin: [0, 0, 0, 12] });

  // ── Сводка по регионам ──
  content.push(sectionTable(C, {
    title: 'Сводка по регионам',
    head: [th('Регион', C), th('Городов', C, { alignment: 'right' }), th('Индекс ср.', C, { alignment: 'right' })],
    rows: (overview?.regions || []).map((r) => [
      { text: String(r.regionName || ''), fontSize: 8, color: C.ink },
      { text: String(r.cityCount ?? ''), fontSize: 8, alignment: 'right', color: C.ink },
      { text: fmtRatio(r.ratioAvg), fontSize: 8, alignment: 'right', color: C.inkMuted },
    ]),
    widths: ['*', 'auto', 'auto'],
    margin: [0, 0, 0, 0],
  }));

  // ── Города и конкуренты ──
  content.push(sectionTitle('Города и конкуренты', C, [0, 16, 0, 0]));
  for (const c of overview?.cities || []) {
    const bits = [];
    const streetLine = [c.street, c.building].filter(Boolean).join(', ');
    if (streetLine) bits.push(`ул.: ${streetLine}`);
    if (c.address_note) bits.push(`прим.: ${c.address_note}`);
    if (c.geocoded_label) bits.push(String(c.geocoded_label));
    const addrSuffix = bits.length ? ` · ${bits.join(' · ')}` : '';

    const compRows = [];
    for (const co of c.competitors || []) {
      const probesStr = Object.entries(co.probes || {})
        .map(([k, v]) => `${k}: ${fmtRub(typeof v === 'number' ? v : parseFloat(v))}`)
        .join('; ');
      const addressStr = co.address ? `Адрес: ${co.address}` : 'Адрес: —';
      const commentStr = (co.comment || co.notes) ? `Комментарий: ${co.comment || co.notes}` : 'Комментарий: —';
      compRows.push([
        { stack: [
          { text: String(co.companyName || ''), fontSize: 8, bold: true, color: C.ink },
          { text: addressStr, fontSize: 7, color: C.inkDim },
          { text: commentStr, fontSize: 7, color: C.inkDim },
        ] },
        { text: fmtRatio(co.ratioAvg), fontSize: 8, alignment: 'right', color: C.inkMuted },
        { text: probesStr || '—', fontSize: 7.5, color: C.ink },
      ]);
    }
    if (compRows.length === 0) compRows.push([{ text: '—', fontSize: 8, color: C.inkDim }, { text: '—', fontSize: 8, alignment: 'right', color: C.inkDim }, { text: 'Нет конкурентов', fontSize: 8, color: C.inkDim }]);

    // Заголовок города + адрес + таблица конкурентов держим вместе.
    content.push(keepTogether(
      { text: `${c.region_name || ''} · ${c.city_name || ''}`, fontSize: 11, bold: true, color: C.ink, margin: [0, 10, 0, 3] },
      {
        text: `Координаты: ${c.lat?.toFixed?.(4) ?? c.lat}, ${c.lng?.toFixed?.(4) ?? c.lng} · Население: ${c.population ?? '—'} · Индекс: ${fmtRatio(c.ratioAvg)}${addrSuffix}`,
        fontSize: 7.5, color: C.inkDim, margin: [0, 0, 0, 6],
      },
      tbl([[th('Компания', C), th('Индекс', C, { alignment: 'right' }), th('Пробы (₽/г)', C)], ...compRows], ['*', 'auto', '*']),
    ));
  }

  // ── История изменений ──
  const histRows = [];
  for (const row of historyRows.slice(0, 120)) {
    const ts = row?.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : '—';
    const action = row?.action === 'create' ? 'Создание' : row?.action === 'update' ? 'Изменение' : row?.action === 'delete' ? 'Удаление' : '—';
    const payloadCity =
      row?.payload?.city_name || row?.payload?.before?.city_name || row?.payload?.patch?.city_name ||
      row?.payload?.company_name || row?.payload?.before?.company_name || '—';
    const actorName = (row?.changed_by_name || '').trim();
    const actorEmail = (row?.changed_by_email || '').trim();
    const actorCell = (actorName || actorEmail)
      ? { stack: [
          actorName ? { text: actorName, bold: true, fontSize: 7.5, color: C.ink } : null,
          actorEmail ? { text: actorEmail, fontSize: 7, color: C.inkDim } : null,
        ].filter(Boolean) }
      : { text: 'Система', fontSize: 7.5, color: C.inkDim };
    histRows.push([
      { text: ts, fontSize: 7.5, color: C.ink },
      { text: row?.entity_type === 'city' ? 'Город' : 'Конкурент', fontSize: 7.5, color: C.inkMuted },
      { text: action, fontSize: 7.5, color: C.inkMuted },
      { text: String(payloadCity || '—'), fontSize: 7.5, color: C.ink },
      actorCell,
    ]);
  }
  if (histRows.length === 0) histRows.push([{ text: '—', fontSize: 7.5, color: C.inkDim }, { text: '—', fontSize: 7.5 }, { text: '—', fontSize: 7.5 }, { text: 'Нет изменений за период', fontSize: 7.5, color: C.inkDim, colSpan: 2 }, {}]);
  content.push(sectionTable(C, {
    title: 'История изменений',
    head: [th('Дата / время', C), th('Тип', C), th('Действие', C), th('Объект', C), th('Кто изменил', C)],
    rows: histRows,
    widths: [80, 52, 52, '*', 110],
    margin: [0, 16, 0, 0],
  }));

  const docDef = {
    ...baseDocDefinition(C, {
      footerLabel: 'REAKTIVO PRO · Индекс золота',
      pageW: PAGE_W,
      marginX: PAGE_MARGIN_X,
      pageHeader: {
        sectionTitle: 'Индекс золота',
        authorName: options?.authorName || '',
        generatedAt: generated,
        logo: logo || null,
      },
    }),
    content,
  };
  if (logo) docDef.images = { brandLogo: logo };
  const out = await pdfMake.createPdf(docDef).getBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
