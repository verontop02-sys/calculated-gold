import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { toCardinal } from 'n2words/ru-RU';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfmakeRoot = dirname(require.resolve('pdfmake/package.json'));
const TEMPLATE_PATH = resolve(__dirname, '..', 'Reaktivo.pdf');
const FONT_REGULAR_PATH = join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Regular.ttf');
const FONT_BOLD_PATH = join(pdfmakeRoot, 'build/fonts/Roboto/Roboto-Medium.ttf');

function capitalizeRu(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rublesInWords(intRub) {
  const n = Math.floor(Math.abs(Number(intRub)) || 0);
  if (!Number.isFinite(n) || n > 999999999) return '';
  const words = toCardinal(n);
  const mod100 = n % 100;
  const mod10 = n % 10;
  let rub = 'рублей';
  if (mod10 === 1 && mod100 !== 11) rub = 'рубль';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) rub = 'рубля';
  return capitalizeRu(`${words} ${rub}`);
}

function formatCellRu(v) {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  return s.replace(/\./g, ',');
}

function formatPriceCell(price, rowEmpty) {
  if (price == null || !Number.isFinite(price)) return '—';
  if (price === 0 && rowEmpty) return '—';
  return String(Math.round(price));
}

function rowIsEmpty(r) {
  const itemName = String(r?.itemName || '').trim();
  const wg = String(r?.weightGross ?? '').trim();
  const wn = String(r?.weightNet ?? '').trim();
  const p = parseMoney(r?.priceRub);
  return !itemName && !wg && !wn && (p == null || p === 0);
}

const LEGAL_CLAUSES = [
  '1. Продавец передаёт в собственность Покупателя указанные в настоящем договоре ювелирные изделия (лом) в обмен на денежную сумму, указанную в графе «Итого».',
  '2. Продавец гарантирует, что является собственником передаваемого имущества, оно не находится под арестом, в залоге и не обременено правами третьих лиц.',
  '3. Оплата производится путём перечисления денежных средств на реквизиты, указанные Продавцом, либо наличными в кассу Покупателя в день заключения настоящего договора.',
  '4. С момента подписания настоящего договора право собственности на переданные изделия переходит к Покупателю.',
  '5. Продавец подтверждает, что ознакомлен с порядком оценки и согласен с результатами оценки и ценой выкупа.',
  '6. Персональные данные Продавца обрабатываются Покупателем в целях исполнения настоящего договора и ведения учёта в соответствии с законодательством РФ о персональных данных.',
  '7. Споры разрешаются путём переговоров, при недостижении согласия — в судебном порядке по месту нахождения Покупателя.',
  '8. Настоящий договор составлен в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из сторон.',
  '9. Подписывая настоящий договор, Продавец подтверждает получение денежных средств в размере, указанном в графе «Итого».',
];

const COMPANY = {
  name: 'ООО «СЭТ»',
  address: '125167, г. Москва, Новый Зыковский проезд, д. 3, офис 19Ц',
  inn: '9710095927',
  ogrn: '1227700089627',
  site: 'www.Reaktivo.ru',
  phone: '8 (916) 500-97-77',
};

function parseMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Только заполненные позиции — без пустых строк-заглушек под шаблон. */
function filledDealRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => !rowIsEmpty(r));
}

/** Геометрия таблицы позиций в шаблоне Reaktivo.pdf (координаты pdf-lib, y снизу). */
const TABLE = {
  /** Чуть левее 69.5 — затереть прежние номера 1–3 из шаблона. */
  xLeft: 40,
  xRight: 576.4,
  /** Верх зоны данных (под шапкой таблицы). */
  yTop: 290.9,
  /** Низ зоны данных (над блоком ИТОГО). */
  yBottom: 182.5,
  /** Высота одной строки как в шаблоне (3 слота). */
  slotH: 36,
  /** Границы колонок: № | наименование | металл | проба | вес | чист. | сумма */
  cols: [40, 69.5, 255.2, 324.7, 382.0, 430.9, 481.0, 576.4],
}

function drawItemsTable(page, filledRows, fonts) {
  const { regularFont } = fonts;
  const pageH = page.getHeight();
  const n = filledRows.length;
  const areaH = TABLE.yTop - TABLE.yBottom;
  const rowH = n <= 0 ? TABLE.slotH : Math.min(TABLE.slotH, areaH / n);

  // Затираем прежние 3 пустые строки шаблона (линии + номера 1–3).
  page.drawRectangle({
    x: TABLE.xLeft,
    y: TABLE.yBottom,
    width: TABLE.xRight - TABLE.xLeft,
    height: areaH,
    color: rgbWhite(),
    borderWidth: 0,
  });

  if (n === 0) return;

  const stroke = { color: rgbLine(), thickness: 0.7 };
  // Внешняя рамка только вокруг занятых строк (сверху — стык с шапкой таблицы).
  const blockH = rowH * n;
  const blockBottom = TABLE.yTop - blockH;

  page.drawRectangle({
    x: TABLE.xLeft,
    y: blockBottom,
    width: TABLE.xRight - TABLE.xLeft,
    height: blockH,
    borderColor: rgbLine(),
    borderWidth: 0.7,
  });

  for (let i = 0; i < n; i += 1) {
    const top = TABLE.yTop - i * rowH;
    const bottom = top - rowH;
    const midY = bottom + rowH * 0.32;
    const yFromTop = pageH - midY;

    if (i > 0) {
      page.drawLine({
        start: { x: TABLE.xLeft, y: top },
        end: { x: TABLE.xRight, y: top },
        ...stroke,
      });
    }

    const r = filledRows[i];
    const rawName = String(r?.itemName || '').trim();
    const metal = String(r?.metal || '').trim() || '—';
    const probe = String(r?.probe || '').trim() || '—';
    const wg = formatCellRu(r?.weightGross);
    const wn = formatCellRu(r?.weightNet);
    const price = parseMoney(r?.priceRub);
    const priceText = formatPriceCell(price ?? 0, false);
    const fontSize = n > 3 ? 8.5 : 9.5;

    const c = TABLE.cols;
    drawTop(page, String(i + 1), c[0] + 4, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[1] - c[0] - 6 });
    drawTop(page, rawName ? formatCellRu(rawName) : '—', c[1] + 4, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[2] - c[1] - 8 });
    drawTop(page, metal, c[2] + 5, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[3] - c[2] - 8 });
    drawTop(page, probe, c[3] + 5, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[4] - c[3] - 8 });
    drawTop(page, wg, c[4] + 5, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[5] - c[4] - 8 });
    drawTop(page, wn, c[5] + 5, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[6] - c[5] - 8 });
    drawTop(page, priceText, c[6] + 5, yFromTop, { size: fontSize, font: regularFont, maxWidth: c[7] - c[6] - 8 });
  }

  // Вертикали колонок
  for (let ci = 1; ci < TABLE.cols.length - 1; ci += 1) {
    const x = TABLE.cols[ci];
    page.drawLine({
      start: { x, y: blockBottom },
      end: { x, y: TABLE.yTop },
      ...stroke,
    });
  }
}

function rgbWhite() {
  return rgb(1, 1, 1);
}

function rgbLine() {
  return rgb(0.15, 0.15, 0.15);
}

/**
 * В шаблоне Reaktivo.pdf год уже напечатан. В overlay — только «ДД.ММ.» (без года).
 * Любой разделитель между частями даты (\D+), иначе regex с [./] не ловил строку.
 * После overlay на форме может стоять ещё «2026» — год из строки убираем полностью.
 */
function issueDateOnForm(issueDateStr) {
  const s0 = String(issueDateStr || '');
  let s = s0.replace(/\u00a0/g, ' ').replace(/\s*г\.?\s*$/i, '').trim();
  if (!s) return '';
  let m = s.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.`;
  m = s.match(/(\d{4})\D+(\d{2})\D+(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.`;
  s = s.replace(/\b20\d{2}\b/g, '').replace(/\.{2,}/g, '.').trim();
  return s;
}

/** Убираем любые 4-значные года из текста даты у шапки (защита от «28.04.20262026»). */
function stripYearsFromOverlayFragment(t) {
  return String(t || '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function drawTop(page, text, x, yFromTop, options = {}) {
  const { size = 10, font, maxWidth, lineHeight, color } = options;
  const y = page.getHeight() - yFromTop;
  page.drawText(String(text || ''), { x, y, size, font, maxWidth, lineHeight, color });
}

export async function buildScrapContractPdfBuffer(body) {
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(readFileSync(FONT_REGULAR_PATH), { subset: true });
  const boldFont = await pdfDoc.embedFont(readFileSync(FONT_BOLD_PATH), { subset: true });
  const page = pdfDoc.getPages()[0];

  const contractNo = String(body.contractNo || '').trim() || '—';
  const sellerName = String(body.sellerName || '').trim() || '—';
  const passportLine = String(body.passportLine || '').trim() || '—';
  const address = String(body.address || '').trim() || '—';
  const appraiserName = String(body.appraiserName || '').trim() || '________________';

  const rows = filledDealRows(body.rows);
  let sum = 0;
  for (const r of rows) {
    const p = parseMoney(r?.priceRub);
    if (p != null && Number.isFinite(p) && p > 0) sum += Math.round(p);
  }
  let totalRub = parseMoney(body.totalRub);
  if (totalRub == null) totalRub = sum;
  totalRub = Math.round(totalRub || 0);
  const amountWords = String(body.amountWords || '').trim() || rublesInWords(totalRub) || '—';
  const issueDate =
    String(body.issueDate || '').trim() ||
    new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
  const issueLine = stripYearsFromOverlayFragment(issueDateOnForm(issueDate));

  // Шапка: номер и дата (год в шаблоне формы; в overlay только «от ДД.ММ.» без 20xx)
  drawTop(page, contractNo, 218, 162, { size: 11, font: regularFont, maxWidth: 60 });
  drawTop(page, stripYearsFromOverlayFragment(`от ${issueLine}`), 320, 162, { size: 10, font: regularFont, maxWidth: 120 });

  // Данные продавца (lines at yFromTop: 479.8, 508.3, 534.6 — baseline 6pt above each)
  drawTop(page, sellerName, 118, 474, { size: 10, font: regularFont, maxWidth: 430 });
  drawTop(page, passportLine, 118, 502, { size: 10, font: regularFont, maxWidth: 430 });
  drawTop(page, address, 118, 528, { size: 10, font: regularFont, maxWidth: 430 });

  // Таблица: только заполненные позиции (пустые слоты шаблона затираем).
  drawItemsTable(page, rows, { regularFont });

  // Итог и подписи (ИТОГО section: y_from_bottom 182.5..128.2; Сумма прописью line at yFromTop=748)
  drawTop(page, `${totalRub} ₽`, 500, 713, { size: 11, font: boldFont, maxWidth: 86 });
  drawTop(page, amountWords, 146, 742, { size: 9.5, font: regularFont, maxWidth: 285 });
  // Appraiser FIO line at yFromTop≈793.8 — baseline 8pt above it
  drawTop(page, appraiserName, 250, 786, { size: 9.3, font: regularFont, maxWidth: 210 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
