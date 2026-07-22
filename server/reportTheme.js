/**
 * Единый стиль PDF-отчётов REAKTIVO PRO.
 *
 * Палитра задана СПЛОШНЫМ hex (без rgba): pdfkit, на котором работает pdfmake,
 * не понимает строки rgba()/hsla() — такие цвета молча игнорируются и текст
 * становится чёрным/невидимым. Поэтому полупрозрачные тона темы заранее сведены
 * к плотному hex поверх фона панели.
 *
 * Тёмная тема: графит + фирменный красный (#fe0000).
 */

export const PALETTE = {
  dark: {
    page:       '#141516',
    panel:      '#222427',
    elevated:   '#2a2c30',
    accent:     '#fe0000',
    accentDim:  '#c40000',
    accentSoft: '#3a1a1c',
    emerald:    '#4ade80',
    emeraldSoft:'#16271f',
    crimson:    '#ff5a63',
    crimsonSoft:'#3a1a1c',
    amber:      '#fbbf24',
    ink:        '#eef0f2',
    inkMuted:   '#9ea1ad',
    inkDim:     '#6b6e79',
    stroke:     '#3a3d44',
    strokeSoft: '#2e3138',
    thFill:     '#2e2224',
    headTxt:    '#ff2a2a',
    rowOdd:     '#1c1e21',
    rowEven:    '#222427',
    chartBg:    '#1a1b1e',
    chartGrid:  '#3a3d44',
    chartText:  '#7e818d',
  },
  light: {
    page:       '#eceeef',
    panel:      '#ffffff',
    elevated:   '#f7f8f9',
    accent:     '#e60000',
    accentDim:  '#b30000',
    accentSoft: '#fde8e8',
    emerald:    '#12824f',
    emeraldSoft:'#eafaf2',
    crimson:    '#d41922',
    crimsonSoft:'#fdecec',
    amber:      '#b45309',
    ink:        '#1a1c1e',
    inkMuted:   '#5c636b',
    inkDim:     '#8a8990',
    stroke:     '#dde0e3',
    strokeSoft: '#eceeef',
    thFill:     '#f8ecec',
    headTxt:    '#b30000',
    rowOdd:     '#ffffff',
    rowEven:    '#f7f8f9',
    chartBg:    '#f7f8f9',
    chartGrid:  '#dde0e3',
    chartText:  '#5c636b',
  },
};

export function pickPalette(theme) {
  return theme === 'light' ? PALETTE.light : PALETTE.dark;
}

const rubFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export const fmtRub = (n) =>
  (n == null || !Number.isFinite(Number(n))) ? '—' : `${rubFmt.format(Math.round(Number(n)))} ₽`;

export const fmtNum = (n, fd = 2) =>
  (n == null || !Number.isFinite(Number(n)))
    ? '—'
    : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: fd, maximumFractionDigits: fd }).format(Number(n));

export const fmtDateRu = (iso) => {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}.${m}.${y}` : s;
};

/**
 * Дельта в процентах без юникод-стрелок (их нет в Roboto): знак + значение.
 * @returns {{ text: string, color: string }}
 */
export function deltaParts(cur, prev, C, invert = false) {
  if (cur == null || prev == null || !Number.isFinite(Number(cur)) || !Number.isFinite(Number(prev)) || Number(prev) === 0) {
    return { text: '—', color: C.inkDim };
  }
  const pct = ((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 100;
  const good = invert ? pct < 0 : pct >= 0;
  const sign = pct >= 0 ? '+' : '−';
  return { text: `${sign}${Math.abs(pct).toFixed(1)}%`, color: good ? C.emerald : C.crimson };
}

/**
 * Слой таблицы для карточек-плиток: плотная заливка, акцентная верхняя кромка,
 * тонкие боковые границы. Высота подгоняется по контенту — без пустот.
 */
export function cardLayout(C) {
  return {
    hLineWidth: (i, node) => (i === 0 ? 2 : i === node.table.body.length ? 0.6 : 0.6),
    vLineWidth: () => 0.6,
    hLineColor: (i) => (i === 0 ? C.accent : C.stroke),
    vLineColor: () => C.stroke,
    paddingLeft: () => 13,
    paddingRight: () => 13,
    paddingTop: () => 11,
    paddingBottom: () => 11,
  };
}

/** Слой для обычных таблиц данных: шапка с заливкой, зебра, тонкие линии. */
export function dataTableLayout(C) {
  return {
    hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
    vLineWidth: () => 0,
    hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? C.accent : C.stroke),
    paddingLeft: () => 10,
    paddingRight: () => 10,
    paddingTop: () => 6,
    paddingBottom: () => 6,
    fillColor: (i) => (i === 0 ? C.thFill : i % 2 === 1 ? C.rowOdd : C.rowEven),
  };
}

/** Заголовок ячейки шапки таблицы. */
export function th(text, C, opt = {}) {
  return { text, bold: true, fontSize: 7.5, color: C.headTxt, ...opt };
}

/** Подпись-заголовок раздела (капс, разрядка). */
export function sectionTitle(text, C, margin = [0, 14, 0, 6]) {
  return {
    text: String(text).toUpperCase(),
    bold: true,
    fontSize: 7.5,
    color: C.inkMuted,
    characterSpacing: 0.1,
    margin,
  };
}

/** Слой для таблицы-раздела: строка 0 — заголовок (без фона), строка 1 — шапка. */
function sectionTableLayout(C) {
  return {
    hLineWidth: (i, node) => {
      if (i === 0) return 0;
      if (i === 1) return 2; // акцентная линия под заголовком раздела
      if (i === node.table.body.length) return 0.8;
      return 0.4;
    },
    vLineWidth: () => 0,
    hLineColor: (i) => (i === 1 ? C.accent : C.stroke),
    paddingLeft: () => 9,
    paddingRight: () => 9,
    paddingTop: (i) => (i === 0 ? 3 : 6),
    paddingBottom: (i) => (i === 0 ? 7 : 6),
    fillColor: (i) => {
      if (i === 0) return null; // заголовок — прозрачный (виден фон страницы)
      if (i === 1) return C.thFill; // шапка столбцов
      return i % 2 === 0 ? C.rowOdd : C.rowEven;
    },
  };
}

/**
 * Таблица-раздел: заголовок вшит первой строкой таблицы и помечен как headerRow,
 * поэтому он НИКОГДА не остаётся «сиротой» внизу страницы, а при переносе таблицы
 * заголовок и шапка столбцов повторяются на новой странице.
 * @param {object} cfg { title, head: cell[], rows: cell[][], widths, margin }
 */
export function sectionTable(C, { title, head, rows, widths, margin = [0, 14, 0, 0] }) {
  const colN = widths.length;
  const titleRow = [
    { text: String(title).toUpperCase(), colSpan: colN, bold: true, fontSize: 7.5, color: C.inkMuted, characterSpacing: 0.1 },
    ...Array.from({ length: colN - 1 }, () => ({})),
  ];
  return {
    table: { widths, headerRows: 2, dontBreakRows: false, body: [titleRow, head, ...rows] },
    layout: sectionTableLayout(C),
    margin,
  };
}

/** Неразрывный блок (заголовок + одиночный контент, напр. график) — не делится между страницами. */
export function keepTogether(...nodes) {
  return { stack: nodes.filter(Boolean), unbreakable: true };
}

/** Одна карточка-плитка (single-cell table) с акцентной кромкой сверху. */
export function statCard(C, { label, value, valueColor, footColumns }) {
  const stack = [
    { text: String(label).toUpperCase(), fontSize: 6.5, bold: true, color: C.inkMuted, characterSpacing: 0.06 },
    { text: value, fontSize: 16, bold: true, color: valueColor || C.ink, margin: [0, 5, 0, footColumns ? 6 : 0] },
  ];
  if (footColumns) stack.push({ columns: footColumns, columnGap: 6 });
  return {
    table: { widths: ['*'], body: [[{ stack, fillColor: C.elevated, border: [true, true, true, true] }]] },
    layout: cardLayout(C),
  };
}

/** Базовое определение документа (фон, шрифт, футер, опц. повторяющаяся шапка). */
export function baseDocDefinition(C, {
  footerLabel = 'REAKTIVO PRO',
  pageW = 595.28,
  pageH = 841.89,
  marginX = 28,
  orientation = 'portrait',
  /** @type {{ sectionTitle?: string, authorName?: string, generatedAt?: string, logo?: string|null }|null} */
  pageHeader = null,
} = {}) {
  const topMargin = pageHeader ? 72 : 28;
  const def = {
    pageSize: 'A4',
    pageOrientation: orientation,
    pageMargins: [marginX, topMargin, marginX, 30],
    background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: pageW, h: pageH, color: C.page }] }),
    defaultStyle: { font: 'Roboto', fontSize: 9, color: C.ink, lineHeight: 1.3 },
    footer: (cur, tot) => ({
      margin: [marginX, 4, marginX, 0],
      columns: [
        { text: footerLabel, color: C.inkDim, fontSize: 6.5 },
        { text: `стр. ${cur} / ${tot}`, alignment: 'right', color: C.inkDim, fontSize: 6.5 },
      ],
    }),
  };

  if (pageHeader) {
    const section = String(pageHeader.sectionTitle || 'Отчёт');
    const who = pageHeader.authorName
      ? `Сформировал: ${pageHeader.authorName}`
      : 'Сформировал: —';
    const when = pageHeader.generatedAt || '';
    def.header = () => {
      const cols = [];
      if (pageHeader.logo) {
        cols.push({ width: 28, image: 'brandLogo', fit: [28, 28], margin: [0, 0, 8, 0] });
      }
      cols.push({
        width: '*',
        stack: [
          { text: 'Reaktivo.PRO', fontSize: 9, bold: true, color: C.ink },
          { text: section, fontSize: 8, bold: true, color: C.accent, margin: [0, 1, 0, 0] },
          { text: `${who}${when ? ` · ${when}` : ''}`, fontSize: 6.5, color: C.inkMuted, margin: [0, 1, 0, 0] },
        ],
      });
      return {
        margin: [marginX, 12, marginX, 0],
        columns: cols,
        columnGap: 8,
      };
    };
  }

  return def;
}

/** Маркер pageBreak перед следующей секцией (для pdfmake content). */
export function sectionPageBreak() {
  return { text: '', pageBreak: 'before' };
}
