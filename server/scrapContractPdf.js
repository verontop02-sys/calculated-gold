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
  '4. Оплата за товар осуществлена наличным расчетом или банковским переводом, по соглашению сторон. После проверки покупателем изделия продавца.',
  '5. Право собственности на товар перешло к покупателю в момент получения продавцом полной суммы по договору наличными или банковским переводом.',
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
  phone: '8 (800) 555-18-48',
};

function parseMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Только заполненные позиции (шаблон Reaktivo.pdf — картинка с 3 слотами). */
function filledDealRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => !rowIsEmpty(r)).slice(0, 3);
}

/**
 * Горизонтали сетки таблицы в шаблоне-картинке (y снизу, pdf-lib).
 * Замерено по Reaktivo.pdf (pageH≈876.24): mupdf y 585.5 / 622 / 658 / 694.5.
 * Свои линии НЕ рисуем — только текст + белая заливка лишних слотов.
 */
const TABLE_Y = [290.74, 254.24, 218.24, 181.74];
/** yFromTop для baseline текста в слотах 1..3 */
const TABLE_TEXT_YFT = [598, 634, 670];
const TABLE_X0 = 35;
const TABLE_X1 = 585;

function coverUnusedTemplateRows(page, filledCount) {
  const n = Math.max(0, Math.min(3, filledCount | 0));
  if (n >= 3) return;
  /**
   * Вертикали шаблона сквозные на 3 слота. Заливаем строго НИЖЕ нижней
   * границы последнего нужного слота (линию оставляем — она закрывает ряд).
   */
  const keepLineY = TABLE_Y[n];
  const tableBottomY = TABLE_Y[3];
  const padBottom = 3;
  // Белое начинается сразу под keepLine (~0.35pt), без зазора с «хвостами» вертикалей.
  const topOfWhite = keepLineY - 0.35;
  const bottomOfWhite = tableBottomY - padBottom;
  const h = topOfWhite - bottomOfWhite;
  if (h <= 1) return;
  page.drawRectangle({
    x: TABLE_X0,
    y: bottomOfWhite,
    width: TABLE_X1 - TABLE_X0,
    height: h,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

function drawFilledRowTexts(page, filledRows, regularFont) {
  for (let i = 0; i < filledRows.length; i += 1) {
    const r = filledRows[i];
    const yFT = TABLE_TEXT_YFT[i];
    const rawName = String(r?.itemName || '').trim();
    const metal = String(r?.metal || '').trim() || '—';
    const probe = String(r?.probe || '').trim() || '—';
    const wg = formatCellRu(r?.weightGross);
    const wn = formatCellRu(r?.weightNet);
    const price = parseMoney(r?.priceRub);
    const priceText = formatPriceCell(price ?? 0, false);

    // Колонки как в прежнем overlay (совпадают с сеткой картинки шаблона).
    drawTop(page, rawName ? formatCellRu(rawName) : '—', 75, yFT, { size: 9.5, font: regularFont, maxWidth: 175 });
    drawTop(page, metal, 260, yFT, { size: 9.5, font: regularFont, maxWidth: 60 });
    drawTop(page, probe, 330, yFT, { size: 9.5, font: regularFont, maxWidth: 48 });
    drawTop(page, wg, 387, yFT, { size: 9.5, font: regularFont, maxWidth: 40 });
    drawTop(page, wn, 436, yFT, { size: 9.5, font: regularFont, maxWidth: 41 });
    drawTop(page, priceText, 486, yFT, { size: 9.5, font: regularFont, maxWidth: 85 });
  }
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

/**
 * Подбирает кегль, при котором строка целиком помещается в maxWidth — вместо переноса
 * pdf-lib на вторую строку, который «наезжает» на соседнее поле снизу (напр. Паспорт → Адрес,
 * где между строками шаблона всего ~26pt). Длинные значения (серия/номер + кем выдан + дата +
 * код подразделения) просто становятся чуть мельче, но остаются в одну строку.
 */
function fitSize(font, text, maxWidth, { size = 10, minSize = 7 } = {}) {
  const str = String(text || '');
  if (!str || !font || !maxWidth) return size;
  let s = size;
  while (s > minSize && font.widthOfTextAtSize(str, s) > maxWidth) {
    s -= 0.25;
  }
  return Math.max(s, minSize);
}

/** Рисует текст одной строкой, подбирая кегль под maxWidth (см. fitSize) — без авто-переноса. */
function drawFit(page, text, x, yFromTop, options = {}) {
  const { size = 10, minSize = 7, font, maxWidth, color } = options;
  const fitted = fitSize(font, text, maxWidth, { size, minSize });
  drawTop(page, text, x, yFromTop, { size: fitted, font, color });
}

function wrapLines(font, text, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function coverFromTop(page, x, yFromTop, width, height) {
  page.drawRectangle({
    x,
    y: page.getHeight() - yFromTop - height,
    width,
    height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

/**
 * Пункты 4, 5 и опечатка в п. 9 зашиты в картинку шаблона.
 * Закрываем старые строки и печатаем новую редакцию поверх.
 */
function overlayLegalClauses(page, font) {
  const size = 7.15;
  const leading = 8.7;
  const x = 48;
  const maxWidth = 246;
  const clause4 = wrapLines(
    font,
    '4. Оплата за товар осуществлена наличным расчетом или банковским переводом, по соглашению сторон. После проверки покупателем изделия продавца.',
    size,
    maxWidth,
  );
  const clause5 = wrapLines(
    font,
    '5. Право собственности на товар перешло к покупателю в момент получения продавцом полной суммы по договору наличными или банковским переводом.',
    size,
    maxWidth,
  );
  // Старые п. 4–5 заканчиваются до п. 6 (его цифра около y 412). Правая колонка с п. 9 начинается около x 338.
  coverFromTop(page, 44, 336, 288, 72);
  const drawBlock = (lines, y0) => {
    lines.forEach((line, i) => {
      drawTop(page, line, x, y0 + i * leading, { size, font });
    });
    return y0 + lines.length * leading;
  };
  const after4 = drawBlock(clause4, 344);
  drawBlock(clause5, after4 + 3.2);

  // П. 9: в шаблоне «по ноМеру телефона».
  coverFromTop(page, 336, 423.5, 236, 12);
  drawTop(page, 'информации по номеру телефона.', 338, 432.2, { size: 7.6, font });
}

/** В шаблоне зашит 8(993) 633 01 01 — закрываем цифры и ставим 8 800. Иконку трубки не трогаем. */
function overlayHeaderPhone(page, font) {
  const pageH = page.getHeight();
  page.drawRectangle({
    x: 468,
    y: pageH - 167.5,
    width: 108,
    height: 15.5,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  drawTop(page, COMPANY.phone, 470.5, 164.2, { size: 10, font, maxWidth: 105 });
}

export function passportLineWithBirthDate(line, birthDate) {
  const l = String(line || '').trim();
  const d = String(birthDate || '').trim();
  if (!d) return l;
  if (l.includes(d) || /дата\s*рожд/i.test(l)) return l;
  return l ? `${l}, дата рождения ${d}` : `дата рождения ${d}`;
}

export async function buildScrapContractPdfBuffer(body) {
  const templateBytes = readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(readFileSync(FONT_REGULAR_PATH), { subset: true });
  const boldFont = await pdfDoc.embedFont(readFileSync(FONT_BOLD_PATH), { subset: true });
  const page = pdfDoc.getPages()[0];
  overlayHeaderPhone(page, regularFont);
  overlayLegalClauses(page, regularFont);

  const contractNo = String(body.contractNo || '').trim() || '—';
  const sellerName = String(body.sellerName || '').trim() || '—';
  const birthDate = String(body.birthDate || body.birth_date || '').trim();
  const passportLine =
    passportLineWithBirthDate(String(body.passportLine || '').trim(), birthDate) || '—';
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

  // Данные продавца (lines at yFromTop: 479.8, 508.3, 534.6 — baseline 6pt above each).
  // Кегль подбирается под ширину поля (fitSize/drawFit), чтобы длинные ФИО/паспорт/адрес
  // не переносились на вторую строку и не наезжали на соседнее поле снизу.
  drawFit(page, sellerName, 118, 474, { size: 10, minSize: 8, font: regularFont, maxWidth: 430 });
  drawFit(page, passportLine, 118, 502, { size: 10, minSize: 7, font: regularFont, maxWidth: 430 });
  drawFit(page, address, 118, 528, { size: 10, minSize: 7, font: regularFont, maxWidth: 430 });

  // Таблица: текст в первых N слотах шаблона; пустые слоты 2–3 затираем белым.
  coverUnusedTemplateRows(page, rows.length);
  drawFilledRowTexts(page, rows, regularFont);

  // Итог и подписи (ИТОГО section: y_from_bottom 182.5..128.2; Сумма прописью line at yFromTop=748)
  drawTop(page, `${totalRub} ₽`, 500, 713, { size: 11, font: boldFont, maxWidth: 86 });
  drawTop(page, amountWords, 146, 742, { size: 9.5, font: regularFont, maxWidth: 285 });
  // Appraiser FIO line at yFromTop≈793.8 — baseline 8pt above it
  drawTop(page, appraiserName, 250, 786, { size: 9.3, font: regularFont, maxWidth: 210 });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
