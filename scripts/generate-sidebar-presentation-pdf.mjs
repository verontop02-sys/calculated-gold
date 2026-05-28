/**
 * Детальная презентация Sidebar-варианта (Вариант 1 редизайна) с визуальными
 * схемами каждого раздела для ПК и мобилки.
 * Запуск: npm run docs:sidebar-pdf
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
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

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  gold: '#9a7318',
  goldStrong: '#7a5a10',
  goldLight: '#f5edd8',
  goldActive: '#e8d070',
  goldSoft: '#fbf6e6',
  bg: '#f3f0ea',
  card: '#ffffff',
  side: '#faf6ee',
  sideDark: '#f0eadc',
  border: '#c9b88a',
  borderSoft: '#e0d8c4',
  bar: '#e4dfd4',
  barDark: '#d0c8b8',
  chart: '#ebe6dc',
  chartGold: '#d9c878',
  chartGold2: '#b89738',
  text: '#1c1814',
  muted: '#7a7060',
  green: '#7ab87a',
  red: '#d97070',
};

const layoutOuter = {
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1.2 : 0.5),
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 1.2 : 0.5),
  hLineColor: () => C.border,
  vLineColor: () => C.border,
};

const layoutInner = {
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => C.borderSoft,
  vLineColor: () => C.borderSoft,
};

const layoutSoft = {
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  hLineWidth: () => 0.3,
  vLineWidth: () => 0.3,
  hLineColor: () => C.borderSoft,
  vLineColor: () => C.borderSoft,
};

// ── Building blocks ──────────────────────────────────────────────────────────
function h1(t) { return { text: t, style: 'h1', margin: [0, 12, 0, 4] }; }
function h2(t) { return { text: t, style: 'h2', margin: [0, 8, 0, 4] }; }
function p(t, opts = {}) { return { text: t, style: 'body', margin: [0, 0, 0, 5], ...opts }; }

function caption(t) {
  return { text: t, style: 'caption', margin: [0, 4, 0, 8], alignment: 'center' };
}

function sectionBadge(t) {
  return {
    table: { widths: ['*'], body: [[{ text: t, style: 'sectionBadge', margin: [10, 5, 10, 5] }]] },
    layout: 'noBorders',
    fillColor: C.goldLight,
    margin: [0, 0, 0, 8],
  };
}

function bar(w, h = 5, color = C.bar) {
  return { canvas: [{ type: 'rect', x: 0, y: 0, w, h, r: 1.5, color }], margin: [0, 0, 0, 3] };
}

function chip(text, color = C.bar, textColor = C.text, bold = false) {
  return {
    table: { widths: ['auto'], body: [[{ text, fontSize: 6, bold, color: textColor, margin: [5, 3, 5, 3] }]] },
    layout: 'noBorders',
    fillColor: color,
  };
}

function chipRow(chips, gap = 4) {
  const cols = [];
  chips.forEach((c, i) => {
    cols.push(c);
    if (i < chips.length - 1) cols.push({ width: gap, text: '' });
  });
  return { columns: cols, margin: [0, 0, 0, 4] };
}

// ── Sidebar (re-usable) ──────────────────────────────────────────────────────
function sidebarItem(label, opts = {}) {
  const { active = false, hidden = false } = opts;
  if (hidden) return { text: '', margin: [0, 0, 0, 0] };
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: label,
        fontSize: 7,
        bold: active,
        color: active ? C.goldStrong : C.text,
        fillColor: active ? C.goldActive : null,
        margin: [6, 4, 6, 4],
      }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 1],
  };
}

function sidebarGroupTitle(t) {
  return { text: t, fontSize: 5.5, bold: true, color: C.muted, margin: [6, 6, 0, 3] };
}

function buildSidebar(activeKey = 'calc', role = 'super') {
  const items = [];
  items.push(sidebarGroupTitle('СДЕЛКИ'));
  items.push(sidebarItem('🧮  Калькулятор', { active: activeKey === 'calc' }));
  items.push(sidebarItem('📄  Договор', { active: activeKey === 'contract' }));
  items.push(sidebarItem('👥  Клиенты', { active: activeKey === 'clients' }));

  items.push(sidebarGroupTitle('АНАЛИТИКА'));
  if (role !== 'seller' || true) {
    items.push(sidebarItem('📊  Аналитика', { active: activeKey === 'analytics' }));
  }
  items.push(sidebarItem('🏆  Команда и KPI', { active: activeKey === 'team' }));
  if (role === 'super') {
    items.push(sidebarItem('🗺  Индекс золота', { active: activeKey === 'gold' }));
  }

  if (role !== 'seller') {
    items.push(sidebarGroupTitle('СИСТЕМА'));
    items.push(sidebarItem(role === 'super' ? '⚙  Настройки' : '⚙  Пользователи', { active: activeKey === 'settings' }));
  }

  const roleBadge = {
    super: { label: 'Супер-админ', color: C.goldLight, fg: C.goldStrong },
    admin: { label: 'Администратор', color: '#e4e8f0', fg: '#3a4a6a' },
    seller: { label: 'Продавец', color: '#e6f0e4', fg: '#3a6a3a' },
  }[role];

  items.push({
    table: { widths: ['*'], body: [[{ text: roleBadge.label, fontSize: 6, alignment: 'center', color: roleBadge.fg, fillColor: roleBadge.color, margin: [4, 4, 4, 4] }]] },
    layout: 'noBorders',
    margin: [4, 20, 4, 4],
  });

  return { stack: items, fillColor: C.side };
}

function topBar() {
  return {
    table: {
      widths: ['*', 90, 80, 70, 36],
      body: [[
        { text: 'REAKTIVO PRO', fontSize: 8, bold: true, color: C.gold, margin: [8, 6, 0, 6] },
        { text: '10 346 ₽/г', fontSize: 7, alignment: 'center', margin: [0, 6, 0, 6] },
        { text: 'Мосбиржа', fontSize: 6.5, alignment: 'center', fillColor: C.goldActive, margin: [4, 5, 4, 5] },
        { text: 'manager@reaktivo.pro', fontSize: 6, color: C.muted, alignment: 'center', margin: [0, 6, 0, 6] },
        { text: 'Выйти', fontSize: 6, alignment: 'center', margin: [0, 6, 0, 6] },
      ]],
    },
    layout: layoutInner,
    fillColor: C.card,
  };
}

function pageHeader(title, subtitle) {
  return {
    table: {
      widths: [16, '*'],
      body: [[
        { canvas: [{ type: 'rect', x: 0, y: 4, w: 6, h: 18, color: C.gold }] },
        { stack: [
          { text: title, fontSize: 14, bold: true, color: C.text },
          { text: subtitle, fontSize: 9, color: C.muted, margin: [0, 1, 0, 0] },
        ], margin: [4, 4, 0, 4] },
      ]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 12],
  };
}

// ── Mock contents for sections ───────────────────────────────────────────────
function calcContent() {
  return {
    stack: [
      { text: 'Калькулятор выкупа', fontSize: 11, bold: true, margin: [8, 8, 0, 6] },
      { text: 'Введите вес и пробу — получите сумму к выдаче', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      {
        columns: [
          { width: '*', stack: [
            { text: 'Вес, г', fontSize: 6.5, color: C.muted, margin: [0, 0, 0, 2] },
            { table: { widths: ['*'], body: [[{ text: '12,5', fontSize: 9, bold: true, margin: [6, 6, 6, 6] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
          { width: 8, text: '' },
          { width: '*', stack: [
            { text: 'Проба', fontSize: 6.5, color: C.muted, margin: [0, 0, 0, 2] },
            { table: { widths: ['*'], body: [[{ text: '585', fontSize: 9, bold: true, margin: [6, 6, 6, 6] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
          { width: 8, text: '' },
          { width: '*', stack: [
            { text: 'К выдаче', fontSize: 6.5, color: C.muted, margin: [0, 0, 0, 2] },
            { table: { widths: ['*'], body: [[{ text: '32 412 ₽', fontSize: 10, bold: true, color: C.goldStrong, margin: [6, 6, 6, 6] }]] }, layout: layoutInner, fillColor: C.goldSoft },
          ]},
        ],
        margin: [8, 0, 8, 12],
      },
      {
        columns: ['375', '500', '585', '750', '900', '916', '999'].map((pb) => ({
          width: 'auto',
          ...(pb === '585' ? chip(pb, C.goldActive, C.goldStrong, true) : chip(pb, C.bar)),
          margin: [0, 0, 4, 0],
        })),
        margin: [8, 0, 8, 12],
      },
      {
        table: { widths: ['*'], body: [[{ text: '➜  Оформить договор', fontSize: 9, bold: true, color: C.card, alignment: 'center', margin: [0, 8, 0, 8] }]] },
        layout: 'noBorders',
        fillColor: C.goldStrong,
        margin: [8, 0, 8, 0],
      },
    ],
    fillColor: C.card,
  };
}

function contractContent() {
  return {
    stack: [
      { text: 'Договор-квитанция', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Привязка клиента, формирование PDF, отправка на email', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      { columns: [
          { width: '*', stack: [
            { text: 'Клиент', fontSize: 6.5, color: C.muted, margin: [0, 0, 0, 2] },
            { table: { widths: ['*'], body: [[{ text: 'Иванов И.И.  +7 999 ...', fontSize: 8, margin: [6, 5, 6, 5] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
          { width: 8, text: '' },
          { width: 100, stack: [
            { text: 'Дата', fontSize: 6.5, color: C.muted, margin: [0, 0, 0, 2] },
            { table: { widths: ['*'], body: [[{ text: '22.05.2026', fontSize: 8, margin: [6, 5, 6, 5] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
        ], margin: [8, 0, 8, 8],
      },
      { text: 'Состав сделки', fontSize: 7, bold: true, color: C.muted, margin: [8, 4, 0, 4] },
      {
        table: {
          widths: ['*', 40, 40, '*'],
          body: [
            [{ text: 'Описание', fontSize: 6.5, bold: true, fillColor: C.goldSoft, margin: [4, 3, 4, 3] }, { text: 'Вес', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'right', margin: [4, 3, 4, 3] }, { text: 'Проба', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'center', margin: [4, 3, 4, 3] }, { text: 'Сумма', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'right', margin: [4, 3, 4, 3] }],
            [{ text: 'Цепь', fontSize: 7 }, { text: '12,5', fontSize: 7, alignment: 'right' }, { text: '585', fontSize: 7, alignment: 'center' }, { text: '32 412 ₽', fontSize: 7, alignment: 'right', bold: true }],
            [{ text: 'Кольцо', fontSize: 7, fillColor: C.bg }, { text: '4,2', fontSize: 7, alignment: 'right', fillColor: C.bg }, { text: '750', fontSize: 7, alignment: 'center', fillColor: C.bg }, { text: '14 058 ₽', fontSize: 7, alignment: 'right', bold: true, fillColor: C.bg }],
          ],
        },
        layout: layoutSoft,
        margin: [8, 0, 8, 8],
      },
      { columns: [
          { width: '*', text: 'Итого', fontSize: 9, bold: true, margin: [10, 4, 0, 0] },
          { width: 'auto', text: '46 470 ₽', fontSize: 11, bold: true, color: C.goldStrong, margin: [0, 2, 10, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 8, y1: 4, x2: 285, y2: 4, lineWidth: 0.5, lineColor: C.borderSoft }], margin: [0, 8, 0, 8] },
      { columns: [
          { width: 120, ...{
            table: { widths: ['*'], body: [[{ text: '🖨  Сформировать PDF', fontSize: 8, bold: true, color: C.card, alignment: 'center', margin: [0, 6, 0, 6] }]] },
            layout: 'noBorders',
            fillColor: C.goldStrong,
          }, margin: [8, 0, 0, 0] },
          { width: 8, text: '' },
          { width: 100, ...{
            table: { widths: ['*'], body: [[{ text: '✉  На email', fontSize: 8, alignment: 'center', margin: [0, 6, 0, 6] }]] },
            layout: layoutInner,
            fillColor: C.card,
          }},
        ],
      },
    ],
    fillColor: C.card,
  };
}

function clientsContent() {
  return {
    stack: [
      { text: 'Клиенты', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Поиск по телефону или ФИО · история сделок и повторный PDF', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      {
        columns: [
          // List
          { width: 110, stack: [
            { table: { widths: ['*'], body: [[{ text: '🔍  Поиск...', fontSize: 7, color: C.muted, margin: [6, 5, 6, 5] }]] }, layout: layoutInner, fillColor: C.card },
            ...['Иванов И.И.', 'Петров П.П.', 'Сидоров С.С.', 'Кузнецов К.', 'Орлов О.'].map((n, i) => ({
              table: { widths: ['*'], body: [[{
                stack: [
                  { text: n, fontSize: 7, bold: i === 1 },
                  { text: '+7 999 ...', fontSize: 5.5, color: C.muted },
                ],
                margin: [6, 4, 6, 4],
              }]] },
              layout: 'noBorders',
              fillColor: i === 1 ? C.goldSoft : (i % 2 === 0 ? C.card : C.side),
              margin: [0, 1, 0, 0],
            })),
          ], fillColor: C.sideDark },
          { width: 8, text: '' },
          // Card
          { width: '*', stack: [
            { text: 'Петров Пётр Петрович', fontSize: 9, bold: true, margin: [4, 0, 0, 2] },
            { text: '+7 999 123-45-67  ·  Москва, ул. Ленина, 12', fontSize: 6.5, color: C.muted, margin: [4, 0, 0, 6] },
            { text: 'История сделок', fontSize: 6.5, bold: true, color: C.muted, margin: [4, 2, 0, 3] },
            {
              table: {
                widths: ['*', 36, 50, 36],
                body: [
                  [{ text: 'Дата', fontSize: 6, fillColor: C.goldSoft, bold: true, margin: [3, 2, 3, 2] }, { text: 'Проба', fontSize: 6, fillColor: C.goldSoft, bold: true, alignment: 'center', margin: [3, 2, 3, 2] }, { text: 'Сумма', fontSize: 6, fillColor: C.goldSoft, bold: true, alignment: 'right', margin: [3, 2, 3, 2] }, { text: 'PDF', fontSize: 6, fillColor: C.goldSoft, bold: true, alignment: 'center', margin: [3, 2, 3, 2] }],
                  [{ text: '21.05', fontSize: 6.5, margin: [3, 2, 3, 2] }, { text: '585', fontSize: 6.5, alignment: 'center' }, { text: '32 412 ₽', fontSize: 6.5, alignment: 'right' }, { text: '⬇', fontSize: 6.5, alignment: 'center' }],
                  [{ text: '14.05', fontSize: 6.5, fillColor: C.bg, margin: [3, 2, 3, 2] }, { text: '750', fontSize: 6.5, alignment: 'center', fillColor: C.bg }, { text: '14 058 ₽', fontSize: 6.5, alignment: 'right', fillColor: C.bg }, { text: '⬇', fontSize: 6.5, alignment: 'center', fillColor: C.bg }],
                  [{ text: '02.05', fontSize: 6.5, margin: [3, 2, 3, 2] }, { text: '999', fontSize: 6.5, alignment: 'center' }, { text: '47 796 ₽', fontSize: 6.5, alignment: 'right' }, { text: '⬇', fontSize: 6.5, alignment: 'center' }],
                ],
              },
              layout: layoutSoft,
              margin: [4, 0, 0, 0],
            },
          ]},
        ],
        margin: [4, 0, 4, 4],
      },
    ],
    fillColor: C.card,
  };
}

function analyticsContent() {
  return {
    stack: [
      { text: 'Аналитика', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Период · KPI · графики · выгрузка PDF', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      // KPI cards
      {
        columns: [
          { width: '*', ...kpiCard('Сделок', '38', C.gold) },
          { width: 8, text: '' },
          { width: '*', ...kpiCard('Оборот', '8,1 М ₽', C.goldStrong) },
          { width: 8, text: '' },
          { width: '*', ...kpiCard('Клиентов', '5', '#7a6a4a') },
          { width: 8, text: '' },
          { width: '*', ...kpiCard('Вес, г', '1 492', '#7a6a4a') },
        ],
        margin: [8, 0, 8, 10],
      },
      // Chart
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 270, h: 60, color: C.chart, r: 4 },
          // bars
          { type: 'rect', x: 14, y: 38, w: 18, h: 18, color: C.chartGold },
          { type: 'rect', x: 38, y: 20, w: 18, h: 36, color: C.chartGold2 },
          { type: 'rect', x: 62, y: 30, w: 18, h: 26, color: C.chartGold },
          { type: 'rect', x: 86, y: 8, w: 18, h: 48, color: C.chartGold2 },
          { type: 'rect', x: 110, y: 22, w: 18, h: 34, color: C.chartGold },
          { type: 'rect', x: 134, y: 32, w: 18, h: 24, color: C.chartGold },
          { type: 'rect', x: 158, y: 14, w: 18, h: 42, color: C.chartGold2 },
          { type: 'rect', x: 182, y: 26, w: 18, h: 30, color: C.chartGold },
          { type: 'rect', x: 206, y: 36, w: 18, h: 20, color: C.chartGold },
          { type: 'rect', x: 230, y: 18, w: 18, h: 38, color: C.chartGold2 },
        ],
        margin: [8, 0, 8, 8],
      },
      { text: 'Сводка по пробам', fontSize: 7, bold: true, color: C.muted, margin: [8, 2, 0, 4] },
      {
        table: {
          widths: ['*', 50, 60, 60],
          body: [
            [{ text: 'Проба', fontSize: 6, bold: true, fillColor: C.goldSoft, margin: [3, 2, 3, 2] }, { text: 'Сделок', fontSize: 6, bold: true, fillColor: C.goldSoft, alignment: 'right' }, { text: 'Вес чистый', fontSize: 6, bold: true, fillColor: C.goldSoft, alignment: 'right' }, { text: 'Сумма', fontSize: 6, bold: true, fillColor: C.goldSoft, alignment: 'right' }],
            [{ text: '585', fontSize: 6.5 }, { text: '14', fontSize: 6.5, alignment: 'right' }, { text: '397,5 г', fontSize: 6.5, alignment: 'right' }, { text: '3 129 991 ₽', fontSize: 6.5, alignment: 'right', bold: true }],
            [{ text: '750', fontSize: 6.5, fillColor: C.bg }, { text: '12', fontSize: 6.5, alignment: 'right', fillColor: C.bg }, { text: '329,2 г', fontSize: 6.5, alignment: 'right', fillColor: C.bg }, { text: '2 609 384 ₽', fontSize: 6.5, alignment: 'right', bold: true, fillColor: C.bg }],
            [{ text: '999', fontSize: 6.5 }, { text: '6', fontSize: 6.5, alignment: 'right' }, { text: '56,9 г', fontSize: 6.5, alignment: 'right' }, { text: '441 556 ₽', fontSize: 6.5, alignment: 'right', bold: true }],
          ],
        },
        layout: layoutSoft,
        margin: [8, 0, 8, 0],
      },
    ],
    fillColor: C.card,
  };
}

function kpiCard(label, value, color) {
  return {
    table: { widths: ['*'], body: [[{
      stack: [
        { text: label, fontSize: 6, color: C.muted },
        { text: value, fontSize: 11, bold: true, color, margin: [0, 2, 0, 0] },
      ],
      margin: [6, 5, 6, 5],
    }]] },
    layout: layoutInner,
    fillColor: C.card,
  };
}

function kpiTeamContent() {
  return {
    stack: [
      { text: 'Команда и KPI', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Рейтинг по обороту · по дням · по неделям', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      {
        table: {
          widths: [20, '*', 50, 70, 50],
          body: [
            [
              { text: '#', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'center', margin: [3, 3, 3, 3] },
              { text: 'Сотрудник', fontSize: 6.5, bold: true, fillColor: C.goldSoft },
              { text: 'Сделок', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'right' },
              { text: 'Оборот', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'right' },
              { text: 'Доля', fontSize: 6.5, bold: true, fillColor: C.goldSoft, alignment: 'right' },
            ],
            [{ text: '🥇', fontSize: 9, alignment: 'center' }, { text: 'rm@reaktivo.ru', fontSize: 7 }, { text: '25', fontSize: 7, alignment: 'right' }, { text: '7 035 640 ₽', fontSize: 7, alignment: 'right', bold: true }, { text: '86,6 %', fontSize: 7, alignment: 'right', color: C.green }],
            [{ text: '🥈', fontSize: 9, alignment: 'center', fillColor: C.bg }, { text: 'topb14onov@…', fontSize: 7, fillColor: C.bg }, { text: '12', fontSize: 7, alignment: 'right', fillColor: C.bg }, { text: '1 039 706 ₽', fontSize: 7, alignment: 'right', bold: true, fillColor: C.bg }, { text: '12,8 %', fontSize: 7, alignment: 'right', fillColor: C.bg }],
            [{ text: '🥉', fontSize: 9, alignment: 'center' }, { text: 'test@mail.ru', fontSize: 7 }, { text: '1', fontSize: 7, alignment: 'right' }, { text: '47 796 ₽', fontSize: 7, alignment: 'right', bold: true }, { text: '0,6 %', fontSize: 7, alignment: 'right', color: C.muted }],
          ],
        },
        layout: layoutSoft,
        margin: [8, 0, 8, 10],
      },
      { text: 'Динамика оборота', fontSize: 7, bold: true, color: C.muted, margin: [8, 2, 0, 4] },
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 280, h: 44, color: C.chart, r: 4 },
          // sparkline-ish
          { type: 'polyline', lineWidth: 1.5, color: C.chartGold2, points: [
            { x: 10, y: 30 }, { x: 40, y: 20 }, { x: 70, y: 8 }, { x: 100, y: 16 },
            { x: 130, y: 24 }, { x: 160, y: 14 }, { x: 190, y: 22 }, { x: 220, y: 18 },
            { x: 250, y: 26 }, { x: 270, y: 22 },
          ]},
        ],
        margin: [8, 0, 8, 0],
      },
    ],
    fillColor: C.card,
  };
}

function goldIndexContent() {
  return {
    stack: [
      { text: 'Индекс золота', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Цены конкурентов по городам · карта · выгрузка PDF/Excel', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      {
        columns: [
          // Map
          { width: '*',
            stack: [
              {
                canvas: [
                  { type: 'rect', x: 0, y: 0, w: 160, h: 90, color: '#d8eadc', r: 4 },
                  { type: 'polygon', points: [
                    { x: 18, y: 22 }, { x: 52, y: 14 }, { x: 100, y: 30 }, { x: 140, y: 18 },
                    { x: 150, y: 72 }, { x: 70, y: 78 }, { x: 22, y: 60 },
                  ], color: '#f0e8d0', lineWidth: 0.6, lineColor: C.gold },
                  // pins
                  { type: 'ellipse', x: 60, y: 42, color: '#e8b070', r1: 4, r2: 4 },
                  { type: 'ellipse', x: 90, y: 56, color: C.green, r1: 4, r2: 4 },
                  { type: 'ellipse', x: 120, y: 36, color: C.red, r1: 4, r2: 4 },
                ],
                margin: [8, 0, 0, 0],
              },
              { columns: [
                  { width: '*', ...chip('● ниже рынка', C.card, C.green) },
                  { width: '*', ...chip('● умеренно', C.card, '#b39030') },
                  { width: '*', ...chip('● выше', C.card, C.red) },
                ], margin: [8, 4, 0, 0],
              },
            ],
          },
          { width: 8, text: '' },
          // List
          { width: 120, stack: [
            { text: 'Города (2)', fontSize: 7, bold: true, color: C.muted, margin: [0, 0, 0, 4] },
            { table: { widths: ['*', 'auto'], body: [[
              { stack: [
                { text: 'Калининград', fontSize: 7, bold: true },
                { text: 'Калининградская обл.', fontSize: 5.5, color: C.muted },
              ], margin: [4, 4, 4, 4] },
              { text: '63 %', fontSize: 7, color: C.green, bold: true, margin: [4, 6, 4, 4] },
            ]] }, layout: layoutInner, fillColor: C.card, margin: [0, 0, 0, 3] },
            { table: { widths: ['*', 'auto'], body: [[
              { stack: [
                { text: 'Заречный', fontSize: 7, bold: true },
                { text: 'Свердловская обл.', fontSize: 5.5, color: C.muted },
              ], margin: [4, 4, 4, 4] },
              { text: '70 %', fontSize: 7, color: '#b39030', bold: true, margin: [4, 6, 4, 4] },
            ]] }, layout: layoutInner, fillColor: C.card, margin: [0, 0, 0, 3] },
            { table: { widths: ['*'], body: [[{ text: '✚  Добавить точку', fontSize: 7, bold: true, color: C.card, alignment: 'center', margin: [0, 5, 0, 5] }]] }, layout: 'noBorders', fillColor: C.goldStrong, margin: [0, 6, 0, 0] },
          ]},
        ],
        margin: [4, 0, 8, 0],
      },
    ],
    fillColor: C.card,
  };
}

function settingsContent() {
  return {
    stack: [
      { text: 'Настройки и доступы', fontSize: 11, bold: true, margin: [8, 8, 0, 4] },
      { text: 'Политика выкупа · поправки по пробам · пользователи', fontSize: 7, color: C.muted, margin: [8, 0, 0, 8] },
      { text: 'Политика выкупа', fontSize: 7, bold: true, color: C.muted, margin: [8, 2, 0, 4] },
      {
        columns: [
          { width: '*', stack: [
            { text: 'Выкуп, % от биржи', fontSize: 6, color: C.muted },
            { table: { widths: ['*'], body: [[{ text: '70', fontSize: 9, bold: true, margin: [6, 6, 6, 6] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
          { width: 8, text: '' },
          { width: '*', stack: [
            { text: 'Полуширина, %', fontSize: 6, color: C.muted },
            { table: { widths: ['*'], body: [[{ text: '1', fontSize: 9, bold: true, margin: [6, 6, 6, 6] }]] }, layout: layoutInner, fillColor: C.card },
          ]},
          { width: 8, text: '' },
          { width: '*', stack: [
            { text: ' ', fontSize: 6 },
            { table: { widths: ['*'], body: [[{ text: 'Сохранить', fontSize: 8, bold: true, color: C.card, alignment: 'center', margin: [0, 6, 0, 6] }]] }, layout: 'noBorders', fillColor: C.goldStrong },
          ]},
        ],
        margin: [8, 0, 8, 10],
      },
      { text: 'Поправки по пробам, %', fontSize: 7, bold: true, color: C.muted, margin: [8, 2, 0, 4] },
      {
        columns: ['375', '500', '585', '750', '900', '916', '999'].map((pb) => ({
          width: '*',
          stack: [
            { text: pb, fontSize: 6, color: C.muted, alignment: 'center' },
            { table: { widths: ['*'], body: [[{ text: '0', fontSize: 8, alignment: 'center', margin: [3, 4, 3, 4] }]] }, layout: layoutInner, fillColor: C.card },
          ],
          margin: [0, 0, 4, 0],
        })),
        margin: [8, 0, 8, 10],
      },
      { text: 'Пользователи', fontSize: 7, bold: true, color: C.muted, margin: [8, 2, 0, 4] },
      {
        table: {
          widths: ['*', 60, 50],
          body: [
            [{ text: 'rm@reaktivo.ru', fontSize: 7, margin: [4, 3, 4, 3] }, { text: 'Админ', fontSize: 6.5, color: '#3a4a6a', fillColor: '#e4e8f0', alignment: 'center', margin: [4, 3, 4, 3] }, { text: 'Изменить', fontSize: 6.5, color: C.muted, alignment: 'center' }],
            [{ text: 'sales@reaktivo.ru', fontSize: 7, fillColor: C.bg, margin: [4, 3, 4, 3] }, { text: 'Продавец', fontSize: 6.5, color: '#3a6a3a', fillColor: '#e6f0e4', alignment: 'center', margin: [4, 3, 4, 3] }, { text: 'Изменить', fontSize: 6.5, color: C.muted, alignment: 'center', fillColor: C.bg }],
          ],
        },
        layout: layoutSoft,
        margin: [8, 0, 8, 0],
      },
    ],
    fillColor: C.card,
  };
}

// ── Desktop layout: sidebar + main ───────────────────────────────────────────
function desktopFrame({ activeKey, role, content }) {
  return {
    stack: [
      topBar(),
      {
        table: {
          widths: [110, '*'],
          body: [[buildSidebar(activeKey, role), content]],
        },
        layout: layoutOuter,
      },
    ],
  };
}

// ── Mobile frame ─────────────────────────────────────────────────────────────
function mobileTopBar() {
  return {
    table: {
      widths: ['*', 42, 36],
      body: [[
        { text: 'REAKTIVO PRO', fontSize: 7, bold: true, color: C.gold, margin: [4, 4, 0, 4] },
        { text: '10 346 ₽', fontSize: 6.5, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: '☰', fontSize: 9, alignment: 'center', margin: [0, 3, 0, 3] },
      ]],
    },
    layout: layoutInner,
    fillColor: C.card,
  };
}

function mobileBottomNav(activeKey = 'calc') {
  const item = (label, icon, key) => ({
    text: `${icon}\n${label}`,
    fontSize: 5,
    alignment: 'center',
    fillColor: activeKey === key ? C.goldActive : C.card,
    color: activeKey === key ? C.goldStrong : C.text,
    bold: activeKey === key,
    margin: [0, 5, 0, 5],
  });
  return {
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [[
        item('Кальк', '🧮', 'calc'),
        item('Договор', '📄', 'contract'),
        item('Клиенты', '👥', 'clients'),
        item('Аналит.', '📊', 'analytics'),
        item('Ещё', '⋯', 'more'),
      ]],
    },
    layout: layoutInner,
    fillColor: C.card,
  };
}

function mobileFrame({ activeKey, contentStack }) {
  return {
    columns: [
      { width: '*', text: '' },
      { width: 145,
        table: {
          widths: [145],
          body: [[{ stack: [
            mobileTopBar(),
            { stack: contentStack, fillColor: C.card },
            mobileBottomNav(activeKey),
          ], margin: [0, 0, 0, 0] }]],
        },
        layout: layoutOuter,
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 4],
  };
}

function mobileCalc() {
  return mobileFrame({ activeKey: 'calc', contentStack: [
    { text: 'Калькулятор', fontSize: 8, bold: true, margin: [6, 6, 0, 4] },
    { text: 'Вес, г', fontSize: 5.5, color: C.muted, margin: [6, 0, 0, 1] },
    { table: { widths: ['*'], body: [[{ text: '12,5', fontSize: 8, bold: true, margin: [4, 4, 4, 4] }]] }, layout: layoutInner, fillColor: C.card, margin: [6, 0, 6, 4] },
    { text: 'Проба', fontSize: 5.5, color: C.muted, margin: [6, 2, 0, 1] },
    { columns: ['375', '500', '585', '750', '999'].map((pb) => ({
        width: '*',
        ...(pb === '585'
          ? { table: { widths: ['*'], body: [[{ text: pb, fontSize: 6, alignment: 'center', bold: true, color: C.goldStrong, margin: [0, 3, 0, 3] }]] }, layout: 'noBorders', fillColor: C.goldActive }
          : { table: { widths: ['*'], body: [[{ text: pb, fontSize: 6, alignment: 'center', margin: [0, 3, 0, 3] }]] }, layout: layoutInner, fillColor: C.card }),
        margin: [1, 0, 1, 0],
      })), margin: [6, 0, 6, 6],
    },
    { table: { widths: ['*'], body: [[{
      stack: [
        { text: 'К выдаче', fontSize: 5.5, color: C.muted, alignment: 'center' },
        { text: '32 412 ₽', fontSize: 12, bold: true, color: C.goldStrong, alignment: 'center', margin: [0, 1, 0, 0] },
      ],
      margin: [4, 6, 4, 6],
    }]] }, layout: layoutInner, fillColor: C.goldSoft, margin: [6, 0, 6, 4] },
    { table: { widths: ['*'], body: [[{ text: '➜ Оформить договор', fontSize: 7, bold: true, color: C.card, alignment: 'center', margin: [0, 5, 0, 5] }]] }, layout: 'noBorders', fillColor: C.goldStrong, margin: [6, 0, 6, 8] },
  ]});
}

function mobileGoldIndex() {
  return mobileFrame({ activeKey: 'more', contentStack: [
    { text: 'Индекс золота', fontSize: 8, bold: true, margin: [6, 6, 0, 4] },
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: 130, h: 70, color: '#d8eadc', r: 4 },
        { type: 'polygon', points: [
          { x: 14, y: 18 }, { x: 44, y: 12 }, { x: 84, y: 28 }, { x: 116, y: 16 },
          { x: 122, y: 60 }, { x: 56, y: 64 }, { x: 18, y: 50 },
        ], color: '#f0e8d0', lineWidth: 0.5, lineColor: C.gold },
        { type: 'ellipse', x: 50, y: 36, color: '#e8b070', r1: 3, r2: 3 },
        { type: 'ellipse', x: 76, y: 46, color: C.green, r1: 3, r2: 3 },
        { type: 'ellipse', x: 100, y: 30, color: C.red, r1: 3, r2: 3 },
      ],
      margin: [6, 0, 6, 4],
    },
    { table: { widths: ['*'], body: [[{ text: '✚ Указать место', fontSize: 6.5, bold: true, color: C.card, alignment: 'center', margin: [0, 5, 0, 5] }]] }, layout: 'noBorders', fillColor: C.goldStrong, margin: [6, 0, 6, 4] },
    { table: { widths: ['*', 'auto'], body: [[
      { stack: [
        { text: 'Калининград', fontSize: 6.5, bold: true },
        { text: 'Калинингр. обл.', fontSize: 5, color: C.muted },
      ], margin: [4, 3, 4, 3] },
      { text: '63 %', fontSize: 6.5, color: C.green, bold: true, margin: [4, 5, 4, 3] },
    ]] }, layout: layoutInner, fillColor: C.card, margin: [6, 0, 6, 2] },
    { table: { widths: ['*', 'auto'], body: [[
      { stack: [
        { text: 'Заречный', fontSize: 6.5, bold: true },
        { text: 'Свердл. обл.', fontSize: 5, color: C.muted },
      ], margin: [4, 3, 4, 3] },
      { text: '70 %', fontSize: 6.5, color: '#b39030', bold: true, margin: [4, 5, 4, 3] },
    ]] }, layout: layoutInner, fillColor: C.card, margin: [6, 0, 6, 8] },
  ]});
}

function mobileAnalytics() {
  return mobileFrame({ activeKey: 'analytics', contentStack: [
    { text: 'Аналитика', fontSize: 8, bold: true, margin: [6, 6, 0, 4] },
    { columns: [
      { width: '*', ...kpiCard('Сделок', '38', C.gold) },
      { width: 4, text: '' },
      { width: '*', ...kpiCard('Оборот', '8,1М', C.goldStrong) },
    ], margin: [6, 0, 6, 4] },
    {
      canvas: [
        { type: 'rect', x: 0, y: 0, w: 130, h: 50, color: C.chart, r: 4 },
        { type: 'rect', x: 10, y: 26, w: 10, h: 22, color: C.chartGold },
        { type: 'rect', x: 26, y: 14, w: 10, h: 34, color: C.chartGold2 },
        { type: 'rect', x: 42, y: 22, w: 10, h: 26, color: C.chartGold },
        { type: 'rect', x: 58, y: 6, w: 10, h: 42, color: C.chartGold2 },
        { type: 'rect', x: 74, y: 18, w: 10, h: 30, color: C.chartGold },
        { type: 'rect', x: 90, y: 28, w: 10, h: 20, color: C.chartGold },
        { type: 'rect', x: 106, y: 10, w: 10, h: 38, color: C.chartGold2 },
      ],
      margin: [6, 0, 6, 4],
    },
    { table: { widths: ['*'], body: [[{ text: '⬇  Скачать PDF', fontSize: 6.5, bold: true, color: C.card, alignment: 'center', margin: [0, 5, 0, 5] }]] }, layout: 'noBorders', fillColor: C.goldStrong, margin: [6, 0, 6, 8] },
  ]});
}

function mobileDrawer() {
  return mobileFrame({ activeKey: 'more', contentStack: [
    { text: 'Ещё', fontSize: 8, bold: true, margin: [6, 6, 0, 4] },
    { text: 'Команда и KPI', fontSize: 7, fillColor: C.card, margin: [8, 5, 8, 5] },
    { text: 'Индекс золота', fontSize: 7, bold: true, color: C.goldStrong, fillColor: C.goldSoft, margin: [8, 5, 8, 5] },
    { text: 'Настройки', fontSize: 7, fillColor: C.card, margin: [8, 5, 8, 5] },
    { text: '── ── ── ── ──', fontSize: 5, color: C.muted, alignment: 'center', margin: [0, 6, 0, 6] },
    { text: 'Тема: 🌙 Тёмная', fontSize: 6.5, color: C.muted, margin: [8, 2, 0, 4] },
    { text: 'Выйти', fontSize: 6.5, color: C.red, bold: true, margin: [8, 2, 0, 4] },
  ]});
}

// ── Roles section: who sees what ─────────────────────────────────────────────
function roleVisibilityRow(active, role, label) {
  return desktopFrame({ activeKey: active, role, content: { stack: [
    { text: label, fontSize: 9, bold: true, color: C.muted, margin: [8, 8, 0, 0] },
  ], fillColor: C.card } });
}

// ── Document ─────────────────────────────────────────────────────────────────
const slide = (children) => ({ stack: children, pageBreak: 'before' });

const doc = {
  pageSize: 'A4',
  pageMargins: [38, 44, 38, 44],
  defaultStyle: { font: 'Roboto', fontSize: 10, color: C.text },
  info: {
    title: 'Reaktivo.Pro — Sidebar-вариант (детальная презентация)',
    author: 'Reaktivo.Pro',
    subject: 'Sidebar SaaS — экраны разделов',
  },
  content: [
    // ── Slide 1: Cover ─────────────────────────────────────────────────────
    {
      stack: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: 520, h: 4, color: C.gold }], margin: [0, 0, 0, 30] },
        { text: 'REAKTIVO PRO', style: 'brand', alignment: 'center', margin: [0, 60, 0, 6] },
        { text: 'Sidebar SaaS', fontSize: 28, bold: true, alignment: 'center', color: C.text, margin: [0, 0, 0, 6] },
        { text: 'Детальная презентация интерфейса', fontSize: 12, color: C.muted, alignment: 'center', margin: [0, 0, 0, 30] },
        { canvas: [
          { type: 'rect', x: 200, y: 0, w: 120, h: 70, r: 6, color: C.side },
          { type: 'rect', x: 200, y: 0, w: 26, h: 70, r: 6, color: C.goldLight },
          { type: 'rect', x: 232, y: 12, w: 80, h: 8, color: C.barDark },
          { type: 'rect', x: 232, y: 26, w: 60, h: 8, color: C.bar },
          { type: 'rect', x: 232, y: 40, w: 70, h: 8, color: C.bar },
          { type: 'rect', x: 232, y: 54, w: 50, h: 8, color: C.bar },
        ], alignment: 'center', margin: [0, 20, 0, 40] },
        { canvas: [{ type: 'line', x1: 200, y1: 0, x2: 320, y2: 0, lineWidth: 0.5, lineColor: C.border }], alignment: 'center', margin: [0, 0, 0, 12] },
        { text: 'Каждый раздел — как будет выглядеть на ПК и на телефоне.', fontSize: 10, color: C.muted, alignment: 'center', margin: [0, 0, 0, 6] },
        { text: '22.05.2026', fontSize: 9, color: C.muted, alignment: 'center', margin: [0, 30, 0, 0] },
      ],
    },

    // ── Slide 2: Layout overview ───────────────────────────────────────────
    slide([
      pageHeader('Каркас интерфейса', 'Шапка · sidebar · контент'),
      sectionBadge('Из чего состоит каждый экран'),
      desktopFrame({
        activeKey: 'analytics',
        role: 'super',
        content: {
          stack: [
            { text: 'Заголовок раздела', fontSize: 10, bold: true, margin: [8, 8, 0, 2] },
            { text: 'Хлебные крошки или пояснение', fontSize: 7, color: C.muted, margin: [8, 0, 0, 10] },
            chartContentBlock(),
            tableRows(3),
          ],
          fillColor: C.card,
        },
      }),
      caption('Sidebar 110px (свёрнутый 56px ↔ развёрнутый 220px) · контент — на весь оставшийся экран'),
      {
        columns: [
          legendItem('Шапка', 'Курс, биржа, профиль, выход — на всех экранах'),
          legendItem('Sidebar', 'Группы: Сделки · Аналитика · Система'),
          legendItem('Контент', 'KPI · графики · таблицы · карта'),
        ],
        margin: [0, 8, 0, 0],
      },
    ]),

    // ── Slide 3: Calculator ────────────────────────────────────────────────
    slide([
      pageHeader('Калькулятор', 'Стартовый экран для всех ролей'),
      sectionBadge('ПК — рабочая ширина для расчётов'),
      desktopFrame({ activeKey: 'calc', role: 'super', content: calcContent() }),
      caption('Поля шире, активная проба подсвечена золотым, итог — крупно справа'),
    ]),

    // ── Slide 4: Contract ──────────────────────────────────────────────────
    slide([
      pageHeader('Договор-квитанция', 'Клиент · позиции · PDF · email'),
      sectionBadge('ПК — на широком экране все поля в одну строку'),
      desktopFrame({ activeKey: 'contract', role: 'super', content: contractContent() }),
      caption('Привязка клиента, состав сделки в табличной форме, две явные кнопки: PDF и email'),
    ]),

    // ── Slide 5: Clients ───────────────────────────────────────────────────
    slide([
      pageHeader('Клиенты', 'База · поиск · история сделок · повторный PDF'),
      sectionBadge('ПК — список слева, карточка справа'),
      desktopFrame({ activeKey: 'clients', role: 'super', content: clientsContent() }),
      caption('Двух-колоночный лэйаут: быстрый поиск + полная история выбранного клиента'),
    ]),

    // ── Slide 6: Analytics ─────────────────────────────────────────────────
    slide([
      pageHeader('Аналитика', 'KPI · графики · сводка по пробам · PDF'),
      sectionBadge('ПК — KPI-карточки, график, сводка'),
      desktopFrame({ activeKey: 'analytics', role: 'super', content: analyticsContent() }),
      caption('Четыре KPI-карточки в один ряд, под ними — крупный график и таблица по пробам'),
    ]),

    // ── Slide 7: Team/KPI ──────────────────────────────────────────────────
    slide([
      pageHeader('Команда и KPI', 'Рейтинг сотрудников, динамика по дням'),
      sectionBadge('ПК — таблица рейтинга + динамика'),
      desktopFrame({ activeKey: 'team', role: 'super', content: kpiTeamContent() }),
      caption('Иконки призёров слева, оборот и доля справа. Под таблицей — спарклайн оборота'),
    ]),

    // ── Slide 8: Gold Index ────────────────────────────────────────────────
    slide([
      pageHeader('Индекс золота', 'Карта + список городов + конкуренты'),
      sectionBadge('ПК — карта на всю ширину контента'),
      desktopFrame({ activeKey: 'gold', role: 'super', content: goldIndexContent() }),
      caption('Карта в основной зоне, города со средним процентом справа · доступен только супер-админу'),
    ]),

    // ── Slide 9: Settings ──────────────────────────────────────────────────
    slide([
      pageHeader('Настройки и доступы', 'Политика выкупа · пробы · пользователи'),
      sectionBadge('ПК — компактные группы параметров'),
      desktopFrame({ activeKey: 'settings', role: 'super', content: settingsContent() }),
      caption('Логические блоки: политика выкупа · поправки по пробам · пользователи и роли'),
    ]),

    // ── Slide 10: Mobile screens ───────────────────────────────────────────
    slide([
      pageHeader('Мобильная версия', 'Полноэкранные разделы · нижнее меню · drawer «Ещё»'),
      sectionBadge('4 ключевых экрана на телефоне'),
      {
        columns: [
          { width: '*', stack: [mobileCalc(), { text: 'Калькулятор', alignment: 'center', fontSize: 7, color: C.muted, bold: true, margin: [0, 4, 0, 0] }] },
          { width: '*', stack: [mobileAnalytics(), { text: 'Аналитика', alignment: 'center', fontSize: 7, color: C.muted, bold: true, margin: [0, 4, 0, 0] }] },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          { width: '*', stack: [mobileGoldIndex(), { text: 'Индекс золота', alignment: 'center', fontSize: 7, color: C.muted, bold: true, margin: [0, 4, 0, 0] }] },
          { width: '*', stack: [mobileDrawer(), { text: 'Меню «Ещё»', alignment: 'center', fontSize: 7, color: C.muted, bold: true, margin: [0, 4, 0, 0] }] },
        ],
      },
      caption('Нижнее меню: Калькулятор · Договор · Клиенты · Аналитика · Ещё (drawer с остальным)'),
    ]),

    // ── Slide 11: Roles ────────────────────────────────────────────────────
    slide([
      pageHeader('Роли — что видит каждый', 'Меню адаптируется под роль автоматически'),
      sectionBadge('Продавец / курьер'),
      desktopFrame({ activeKey: 'calc', role: 'seller', content: { stack: [
        { text: 'Видит только нужное для работы в поле', fontSize: 9, color: C.muted, margin: [8, 8, 0, 8] },
        { ul: [
          { text: 'Калькулятор и Договор — основная работа', fontSize: 7 },
          { text: 'Клиенты и история сделок', fontSize: 7 },
          { text: 'KPI — только свои показатели', fontSize: 7 },
        ], margin: [12, 0, 8, 0] },
      ], fillColor: C.card } }),
      caption('Скрыты: Аналитика по компании, Индекс золота, Настройки'),

      sectionBadge('Администратор'),
      desktopFrame({ activeKey: 'team', role: 'admin', content: { stack: [
        { text: 'Видит всю команду и управление пользователями', fontSize: 9, color: C.muted, margin: [8, 8, 0, 8] },
        { ul: [
          { text: 'Полная аналитика и KPI всей команды', fontSize: 7 },
          { text: 'Управление пользователями (продавцы, курьеры)', fontSize: 7 },
        ], margin: [12, 0, 8, 0] },
      ], fillColor: C.card } }),
      caption('Скрыт: Индекс золота и системные настройки выкупа'),
    ]),

    // ── Slide 12: Roles 2: Super ───────────────────────────────────────────
    slide([
      pageHeader('Супер-администратор', 'Полный доступ — все разделы'),
      sectionBadge('Видит весь функционал'),
      desktopFrame({ activeKey: 'gold', role: 'super', content: { stack: [
        { text: 'Доступны все разделы', fontSize: 9, color: C.muted, margin: [8, 8, 0, 8] },
        { ul: [
          { text: 'Все «Сделки»: Калькулятор, Договор, Клиенты', fontSize: 7 },
          { text: 'Аналитика, Команда и KPI, Индекс золота', fontSize: 7 },
          { text: 'Настройки выкупа и доступы (полные права)', fontSize: 7 },
        ], margin: [12, 0, 8, 0] },
      ], fillColor: C.card } }),
      caption('Бейдж роли в нижней части sidebar показывает, кто работает в системе'),
    ]),

    // ── Slide 13: States ───────────────────────────────────────────────────
    slide([
      pageHeader('Состояния и анимации', 'Чтобы интерфейс ощущался живым'),
      {
        columns: [
          legendCard('Skeleton', 'Светящиеся плашки во время загрузки данных, чтобы экран не «прыгал» при появлении контента.'),
          legendCard('Empty state', 'Если данных нет — иконка + короткое объяснение и кнопка «Создать первый».'),
          legendCard('Hover / focus', 'Карточки и строки таблиц подсвечиваются при наведении · подсказки и тултипы.'),
        ],
        margin: [0, 8, 0, 8],
      },
      {
        columns: [
          legendCard('Loading-блокировка', 'При сохранении модалка/кнопка показывает спиннер и не даёт ткнуть лишнее.'),
          legendCard('Анимация перехода', 'Между разделами — плавное fade + slide вместо мерцания.'),
          legendCard('Тёмная / светлая тема', 'Переключатель в sidebar внизу. Один стиль для всех экранов.'),
        ],
        margin: [0, 0, 0, 8],
      },
      caption('Это не «украшательство», а ощущение скорости и предсказуемости работы'),
    ]),

    // ── Slide 14: Roadmap ──────────────────────────────────────────────────
    slide([
      pageHeader('Этапы внедрения', 'Без срыва текущей работы — переключение раздел за разделом'),
      {
        table: {
          widths: [50, '*'],
          body: [
            [{ text: 'Фаза A', fontSize: 10, bold: true, color: C.goldStrong, fillColor: C.goldSoft, margin: [6, 6, 6, 6] }, { stack: [
              { text: 'Каркас', fontSize: 9, bold: true },
              { text: 'AppShell, sidebar, мобильное нижнее меню, маршруты, права по ролям, тема', fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] },
            ], margin: [6, 6, 6, 6] }],
            [{ text: 'Фаза B', fontSize: 10, bold: true, color: C.goldStrong, fillColor: C.goldSoft, margin: [6, 6, 6, 6] }, { stack: [
              { text: 'Перенос разделов', fontSize: 9, bold: true },
              { text: 'По очереди: Калькулятор → Договор → Клиенты → Аналитика → KPI → Индекс → Настройки. На каждом — ширина, skeleton, empty state.', fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] },
            ], margin: [6, 6, 6, 6] }],
            [{ text: 'Фаза C', fontSize: 10, bold: true, color: C.goldStrong, fillColor: C.goldSoft, margin: [6, 6, 6, 6] }, { stack: [
              { text: 'Полировка', fontSize: 9, bold: true },
              { text: 'Анимации, единые карточки и таблицы, тёмная тема, тестирование на Safari iPhone + Chrome Desktop.', fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] },
            ], margin: [6, 6, 6, 6] }],
          ],
        },
        layout: layoutSoft,
        margin: [0, 4, 0, 10],
      },
      caption('Срок ориентировочно — 7–10 рабочих дней. Точные сроки и КП — после согласования варианта.'),
    ]),

    // ── Slide 15: Questions ────────────────────────────────────────────────
    slide([
      pageHeader('Вопросы для согласования', 'Чтобы перейти к ТЗ и сметё'),
      {
        ol: [
          'Подходит ли Sidebar-вариант или ещё рассматриваем альтернативы?',
          'Продавец видит общую аналитику компании или только свой KPI?',
          'Курьер = те же экраны, что продавец, или позже отдельный сценарий «выезд / СМС»?',
          'Индекс золота — только супер-админ или ещё кто-то?',
          'Тёмная тема в sidebar — добавлять переключатель или фиксируем один вариант?',
        ].map((t) => ({ text: t, style: 'body', margin: [0, 5, 0, 5] })),
        margin: [0, 8, 0, 16],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 0.5, lineColor: C.borderSoft }], margin: [0, 0, 0, 10] },
      { text: 'reaktivo.pro · 22.05.2026', alignment: 'center', fontSize: 8, color: C.muted },
    ]),
  ],
  styles: {
    brand: { fontSize: 22, bold: true, color: C.gold, characterSpacing: 1 },
    h1: { fontSize: 14, bold: true },
    h2: { fontSize: 11, bold: true, color: C.gold },
    body: { fontSize: 9.5, lineHeight: 1.35 },
    caption: { fontSize: 8, italics: true, color: C.muted },
    sectionBadge: { fontSize: 9, bold: true, color: C.goldStrong },
  },
};

function chartContentBlock() {
  return {
    stack: [
      {
        columns: [
          { width: '*', ...kpiCard('Сделок', '38', C.gold) },
          { width: 8, text: '' },
          { width: '*', ...kpiCard('Оборот', '8,1 М ₽', C.goldStrong) },
          { width: 8, text: '' },
          { width: '*', ...kpiCard('Клиенты', '5', '#7a6a4a') },
        ],
        margin: [8, 0, 8, 8],
      },
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 270, h: 60, color: C.chart, r: 4 },
          { type: 'rect', x: 14, y: 38, w: 18, h: 18, color: C.chartGold },
          { type: 'rect', x: 38, y: 20, w: 18, h: 36, color: C.chartGold2 },
          { type: 'rect', x: 62, y: 30, w: 18, h: 26, color: C.chartGold },
          { type: 'rect', x: 86, y: 8, w: 18, h: 48, color: C.chartGold2 },
          { type: 'rect', x: 110, y: 22, w: 18, h: 34, color: C.chartGold },
        ],
        margin: [8, 0, 8, 8],
      },
    ],
  };
}

function tableRows(n = 3) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push([
      { text: ' ', fillColor: i % 2 ? C.bg : C.card, margin: [0, 4, 0, 4] },
      { text: ' ', fillColor: i % 2 ? C.bg : C.card, margin: [0, 4, 0, 4] },
      { text: ' ', fillColor: i % 2 ? C.bg : C.card, margin: [0, 4, 0, 4] },
      { text: ' ', fillColor: i % 2 ? C.bg : C.card, margin: [0, 4, 0, 4] },
    ]);
  }
  return {
    table: { widths: ['*', '*', '*', '*'], body: rows },
    layout: layoutSoft,
    margin: [8, 0, 8, 6],
  };
}

function legendItem(title, sub) {
  return {
    width: '*',
    stack: [
      { text: title, fontSize: 8, bold: true, color: C.gold },
      { text: sub, fontSize: 7, color: C.muted, margin: [0, 2, 0, 0] },
    ],
    margin: [4, 0, 4, 0],
  };
}

function legendCard(title, text) {
  return {
    width: '*',
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: title, fontSize: 9, bold: true, color: C.gold },
          { text, fontSize: 7.5, color: C.muted, margin: [0, 4, 0, 0], lineHeight: 1.4 },
        ],
        margin: [10, 8, 10, 8],
      }]],
    },
    layout: layoutSoft,
    fillColor: C.goldSoft,
    margin: [4, 0, 4, 0],
  };
}

// roleVisibilityRow declared above but unused for brevity; reference it to silence noUnused
void roleVisibilityRow;

const outPath = join(root, 'docs', 'Reaktivo_Pro_Sidebar_Презентация.pdf');
const buffer = await pdfMake.createPdf(doc).getBuffer();
writeFileSync(outPath, buffer);
console.log('PDF saved:', outPath);
