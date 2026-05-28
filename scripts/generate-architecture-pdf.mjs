/**
 * Генерация PDF «Архитектура интерфейса — Этап 6» с визуальными wireframe-схемами.
 * Запуск: npm run docs:architecture-pdf
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

// ── Palette (wireframes) ─────────────────────────────────────────────────────
const C = {
  gold: '#9a7318',
  goldLight: '#f5edd8',
  goldActive: '#e8d070',
  bg: '#f3f0ea',
  card: '#ffffff',
  side: '#faf6ee',
  border: '#c9b88a',
  bar: '#e4dfd4',
  barDark: '#d0c8b8',
  chart: '#ebe6dc',
  chartGold: '#d9c878',
  text: '#1c1814',
  muted: '#7a7060',
  danger: '#e8c4c4',
  ok: '#c8e6c8',
};

const wireLayout = {
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1.2 : 0.6),
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 1.2 : 0.6),
  hLineColor: () => C.border,
  vLineColor: () => C.border,
};

const wireLayoutInner = {
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => '#ddd8ce',
  vLineColor: () => '#ddd8ce',
};

function h1(t) {
  return { text: t, style: 'h1', margin: [0, 14, 0, 6] };
}
function h2(t) {
  return { text: t, style: 'h2', margin: [0, 10, 0, 4] };
}
function p(t, opts = {}) {
  return { text: t, style: 'body', margin: [0, 0, 0, 5], ...opts };
}
function bullet(items) {
  return {
    ul: items.map((t) => ({ text: t, style: 'body', margin: [0, 2, 0, 2] })),
    margin: [0, 4, 0, 8],
  };
}

/** Мини-подпись под схемой */
function wireCaption(t) {
  return { text: t, style: 'wireCaption', margin: [0, 4, 0, 10], alignment: 'center' };
}

/** Плашка-заголовок секции схемы */
function wireSectionTitle(t) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: t, style: 'wireSection', margin: [8, 5, 8, 5] }]],
    },
    layout: 'noBorders',
    fillColor: C.goldLight,
    margin: [0, 0, 0, 6],
  };
}

function miniBar(w, h = 5, color = C.bar) {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w, h, r: 2, color }],
    margin: [0, 0, 0, 3],
  };
}

function navItem(label, active = false) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: label,
        fontSize: 6.5,
        bold: active,
        color: active ? C.gold : C.text,
        fillColor: active ? C.goldActive : C.bar,
        margin: [4, 3, 4, 3],
        alignment: 'left',
      }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 2],
  };
}

function sideNavItem(label, active = false) {
  return {
    text: label,
    fontSize: 6.5,
    bold: active,
    color: active ? C.gold : C.muted,
    fillColor: active ? C.goldLight : null,
    margin: [2, 3, 2, 3],
  };
}

function statCard(label, w = '*') {
  return {
    stack: [
      miniBar(40, 4, C.barDark),
      { text: label, fontSize: 5.5, color: C.muted, margin: [0, 2, 0, 0] },
      miniBar(28, 7, C.chartGold),
    ],
    margin: [4, 4, 4, 4],
  };
}

function chartBlock(h = 48) {
  return {
    stack: [
      miniBar(120, 4),
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 280, h, r: 4, color: C.chart },
          // fake bars
          { type: 'rect', x: 20, y: h - 25, w: 18, h: 20, color: C.chartGold },
          { type: 'rect', x: 50, y: h - 35, w: 18, h: 30, color: C.chartGold },
          { type: 'rect', x: 80, y: h - 20, w: 18, h: 15, color: C.barDark },
          { type: 'rect', x: 110, y: h - 40, w: 18, h: 35, color: C.chartGold },
        ],
        margin: [0, 4, 0, 0],
      },
    ],
    margin: [6, 4, 6, 4],
  };
}

function tableRows(n = 4) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push([
      { text: ' ', fillColor: i % 2 ? C.card : C.bg, margin: [0, 5, 0, 5] },
      { text: ' ', fillColor: i % 2 ? C.card : C.bg, margin: [0, 5, 0, 5] },
      { text: ' ', fillColor: i % 2 ? C.card : C.bg, margin: [0, 5, 0, 5] },
    ]);
  }
  return {
    table: { widths: ['*', '*', '*'], body: rows },
    layout: wireLayoutInner,
    margin: [6, 0, 6, 6],
  };
}

/** Верхняя полоса (курс) — общая для всех схем */
function wireTopBar(wide = true) {
  const row = wide
    ? [
        { text: 'REAKTIVO PRO', fontSize: 7, bold: true, color: C.gold, margin: [6, 5, 0, 5] },
        { text: '10 346 ₽/г', fontSize: 6.5, alignment: 'center', margin: [0, 5, 0, 5] },
        { text: 'Мосбиржа', fontSize: 6, alignment: 'center', fillColor: C.goldActive, margin: [2, 4, 2, 4] },
        { text: 'user@…', fontSize: 5.5, color: C.muted, alignment: 'center', margin: [0, 5, 0, 5] },
        { text: 'Выйти', fontSize: 5.5, alignment: 'center', margin: [0, 5, 0, 5] },
      ]
    : [
        { text: 'REAKTIVO PRO', fontSize: 6.5, bold: true, color: C.gold, margin: [4, 4, 0, 4] },
        { text: '10 346 ₽', fontSize: 6, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: 'user', fontSize: 5.5, color: C.muted, alignment: 'center', margin: [0, 4, 0, 4] },
        { text: '✕', fontSize: 6, alignment: 'center', margin: [0, 4, 0, 4] },
      ];
  return {
    table: {
      widths: wide ? ['*', 70, 70, 50, 40] : ['*', 42, 36, 20],
      body: [row],
    },
    layout: wireLayoutInner,
    fillColor: C.card,
    margin: [0, 0, 0, 0],
  };
}

/** Схема: СЕЙЧАС (узкая колонка по центру) */
function wireframeCurrentDesktop() {
  const narrowContent = {
    stack: [
      wireTopBar(false),
      {
        table: {
          widths: [48, 48, 48, 48],
          body: [[
            { text: 'Кальк.', fontSize: 5, alignment: 'center', fillColor: C.goldActive, margin: [1, 3, 1, 3] },
            { text: 'Договор', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
            { text: 'Клиенты', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
            { text: 'Аналит.', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
          ], [
            { text: 'KPI', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
            { text: 'Индекс', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
            { text: 'Настр.', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
            { text: ' ', fontSize: 5, margin: [1, 3, 1, 3] },
          ]],
        },
        layout: wireLayoutInner,
        margin: [0, 0, 0, 0],
      },
      { text: 'Контент (таблица / форма)', fontSize: 6, color: C.muted, margin: [6, 6, 6, 2] },
      chartBlock(36),
      tableRows(3),
    ],
  };

  return {
    stack: [
      wireSectionTitle('СЕЙЧАС — как на ПК (узкая колонка ~520px, много пустого места по бокам)'),
      {
        table: {
          widths: ['*', 200, '*'],
          body: [[
            { text: '', fillColor: C.bg },
            { stack: [narrowContent], fillColor: C.card },
            { text: '', fillColor: C.bg },
          ]],
        },
        layout: wireLayout,
      },
      wireCaption('Серые поля — неиспользуемое пространство на широком мониторе'),
    ],
  };
}

/** Схема: СЕЙЧАС мобилка */
function wireframeCurrentMobile() {
  return phoneFrame('СЕЙЧАС — телефон', [
    wireTopBar(false),
    navItem('Калькулятор', true),
    navItem('Договор'),
    navItem('Клиенты'),
    navItem('Аналитика'),
    navItem('KPI · Индекс · Настр.'),
    { text: 'Форма / таблица', fontSize: 5.5, color: C.muted, margin: [0, 4, 0, 2] },
    chartBlock(28),
    tableRows(2),
  ]);
}

/** Схема: Вариант 1 Desktop — Sidebar */
function wireframeV1Desktop() {
  const sidebar = {
    stack: [
      { text: 'СДЕЛКИ', fontSize: 5.5, bold: true, color: C.muted, margin: [4, 6, 0, 2] },
      sideNavItem('  Калькулятор', true),
      sideNavItem('  Договор'),
      sideNavItem('  Клиенты'),
      { text: 'АНАЛИТИКА', fontSize: 5.5, bold: true, color: C.muted, margin: [4, 8, 0, 2] },
      sideNavItem('  Аналитика'),
      sideNavItem('  Команда и KPI'),
      sideNavItem('  Индекс золота'),
      { text: 'СИСТЕМА', fontSize: 5.5, bold: true, color: C.muted, margin: [4, 8, 0, 2] },
      sideNavItem('  Настройки'),
      { text: 'Продавец', fontSize: 5.5, fillColor: C.goldLight, color: C.gold, margin: [4, 16, 4, 6], alignment: 'center' },
    ],
    fillColor: C.side,
    margin: [0, 0, 0, 0],
  };

  const main = {
    stack: [
      { text: 'Аналитика', fontSize: 9, bold: true, margin: [8, 8, 0, 4] },
      {
        columns: [
          { width: '*', stack: [statCard('Сделок')] },
          { width: '*', stack: [statCard('Оборот')] },
          { width: '*', stack: [statCard('Клиенты')] },
          { width: '*', stack: [statCard('Вес')] },
        ],
        margin: [4, 0, 4, 0],
      },
      chartBlock(52),
      tableRows(4),
    ],
    fillColor: C.card,
  };

  return {
    stack: [
      wireSectionTitle('ВАРИАНТ 1 — ПК: боковая панель + контент на всю ширину (рекомендуем)'),
      wireTopBar(true),
      {
        table: {
          widths: [78, '*'],
          body: [[sidebar, main]],
        },
        layout: wireLayout,
        margin: [0, 0, 0, 0],
      },
      {
        columns: [
          { width: 78, text: '56–220px\nраскрытие', fontSize: 5.5, color: C.muted, alignment: 'center' },
          { width: '*', text: 'Таблицы, графики, карта — на всю рабочую зону', fontSize: 5.5, color: C.muted, alignment: 'center' },
        ],
        margin: [0, 4, 0, 0],
      },
      wireCaption('При наведении sidebar расширяется и показывает подписи разделов'),
    ],
  };
}

/** Схема: Вариант 1 Mobile — bottom nav */
function wireframeV1Mobile() {
  const content = [
    wireTopBar(false),
    { text: 'Аналитика', fontSize: 7, bold: true, margin: [0, 4, 0, 4] },
    {
      columns: [
        { width: '*', stack: [miniBar(30, 6, C.chartGold), { text: '38', fontSize: 6, alignment: 'center' }] },
        { width: '*', stack: [miniBar(30, 6, C.chartGold), { text: '8M ₽', fontSize: 6, alignment: 'center' }] },
      ],
      margin: [0, 0, 0, 4],
    },
    chartBlock(32),
    tableRows(2),
  ];

  const bottomNav = {
    table: {
      widths: [26, 26, 26, 26, 26],
      body: [[
        { text: '🧮\nКальк', fontSize: 4.5, alignment: 'center', fillColor: C.bar, margin: [0, 4, 0, 4] },
        { text: '📄\nДоговор', fontSize: 4.5, alignment: 'center', fillColor: C.bar, margin: [0, 4, 0, 4] },
        { text: '👥\nКлиенты', fontSize: 4.5, alignment: 'center', fillColor: C.bar, margin: [0, 4, 0, 4] },
        { text: '📊\nАналит.', fontSize: 4.5, alignment: 'center', fillColor: C.goldActive, margin: [0, 4, 0, 4] },
        { text: '⋯\nЕщё', fontSize: 4.5, alignment: 'center', fillColor: C.bar, margin: [0, 4, 0, 4] },
      ]],
    },
    layout: wireLayoutInner,
    fillColor: C.card,
  };

  return phoneFrame('ВАРИАНТ 1 — телефон: нижнее меню', [
    ...content,
    bottomNav,
  ]);
}

/** Схема: Вариант 2 — верхние табы + боковая колонка фильтров */
function wireframeV2Desktop() {
  const tabs = {
    table: {
      widths: [52, 52, 52, 52, 58, 52, 62],
      body: [[
        { text: 'Кальк.', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
        { text: 'Договор', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
        { text: 'Клиенты', fontSize: 5, alignment: 'center', fillColor: C.goldActive, margin: [1, 3, 1, 3] },
        { text: 'Аналит.', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
        { text: 'KPI', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
        { text: 'Индекс', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
        { text: 'Настройки', fontSize: 5, alignment: 'center', fillColor: C.bar, margin: [1, 3, 1, 3] },
      ]],
    },
    layout: wireLayoutInner,
  };

  const leftCol = {
    stack: [
      { text: 'Список клиентов', fontSize: 6.5, bold: true, margin: [4, 6, 0, 4] },
      navItem('Иванов И.И.'),
      navItem('Петров П.П.', true),
      navItem('Сидоров С.С.'),
      navItem('… ещё 12'),
    ],
    fillColor: C.side,
  };

  const rightCol = {
    stack: [
      { text: 'Карточка клиента', fontSize: 7, bold: true, margin: [6, 6, 0, 4] },
      miniBar(160, 5),
      miniBar(140, 5),
      { text: 'Сделки и договоры', fontSize: 6, color: C.muted, margin: [6, 6, 0, 2] },
      tableRows(3),
    ],
    fillColor: C.card,
  };

  return {
    stack: [
      wireSectionTitle('ВАРИАНТ 2 — ПК: верхние табы + контекстная колонка слева'),
      wireTopBar(true),
      tabs,
      {
        table: {
          widths: [100, '*'],
          body: [[leftCol, rightCol]],
        },
        layout: wireLayout,
      },
      wireCaption('Ближе к текущей версии, но шире (~1280px). Табы в одну строку могут быть тесными.'),
    ],
  };
}

/** Схема: Вариант 3 — dashboard плитки (продавец) */
function wireframeV3Dashboard() {
  function tile(title, sub, active = false) {
    return {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: title, fontSize: 8, bold: true, color: active ? C.gold : C.text },
            { text: sub, fontSize: 5.5, color: C.muted },
          ],
          margin: [8, 10, 8, 10],
        }]],
      },
      layout: wireLayoutInner,
      fillColor: active ? C.goldLight : C.card,
    };
  }

  return {
    stack: [
      wireSectionTitle('ВАРИАНТ 3 — режим «Смена» для продавца (плитки вместо 7 табов)'),
      wireTopBar(true),
      { text: 'Добрый день, продавец', fontSize: 8, margin: [8, 10, 0, 6] },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [tile('Новый расчёт', 'Калькулятор', true), tile('Оформить договор', 'PDF + клиент')],
            [tile('Найти клиента', 'База и история'), tile('Мой KPI', 'Только мои сделки')],
          ],
        },
        layout: wireLayout,
      },
      wireCaption('Руководитель видит другой набор плиток: Сводка · Команда · Аналитика · PDF'),
    ],
  };
}

/** Рамка телефона */
function phoneFrame(label, innerStack) {
  return {
    stack: [
      { text: label, style: 'wireLabel', alignment: 'center' },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 128,
            table: {
              widths: [128],
              body: [[{ stack: innerStack, margin: [0, 0, 0, 0] }]],
            },
            layout: wireLayout,
            fillColor: C.card,
          },
          { width: '*', text: '' },
        ],
      },
    ],
    margin: [0, 0, 0, 4],
  };
}

/** Сравнение три варианта в один ряд (мини) */
function wireframeCompareRow() {
  const mini = (title, bodyStack) => ({
    stack: [
      { text: title, fontSize: 6.5, bold: true, alignment: 'center', color: C.gold, margin: [0, 0, 0, 4] },
      bodyStack,
    ],
    margin: [2, 2, 2, 2],
  });

  const v1mini = {
    table: { widths: [22, '*'], body: [[
      { text: '▌\n▌\n▌', fontSize: 5, fillColor: C.goldLight, alignment: 'center' },
      { stack: [miniBar(50), miniBar(40)], margin: [4, 8, 4, 8] },
    ]] },
    layout: wireLayoutInner,
  };
  const v2mini = {
    stack: [
      {
        table: {
          widths: [18, 18, 18],
          body: [[
            { text: 'T', fontSize: 4, fillColor: C.bar, margin: [1, 2, 1, 2] },
            { text: 'T', fontSize: 4, fillColor: C.goldActive, margin: [1, 2, 1, 2] },
            { text: 'T', fontSize: 4, fillColor: C.bar, margin: [1, 2, 1, 2] },
          ]],
        },
        layout: 'noBorders',
      },
      {
        table: {
          widths: [28, '*'],
          body: [[
            { text: ' ', fillColor: C.side, margin: [0, 14, 0, 14] },
            { stack: [miniBar(36)], margin: [4, 10, 4, 10] },
          ]],
        },
        layout: wireLayoutInner,
      },
    ],
  };
  const v3mini = {
    table: { widths: ['*', '*'], body: [
      [{ text: '□', fontSize: 8, alignment: 'center', fillColor: C.goldLight, margin: [0,6,0,6] }, { text: '□', fontSize: 8, alignment: 'center', fillColor: C.card, margin: [0,6,0,6] }],
      [{ text: '□', fontSize: 8, alignment: 'center', fillColor: C.card, margin: [0,6,0,6] }, { text: '□', fontSize: 8, alignment: 'center', fillColor: C.card, margin: [0,6,0,6] }],
    ]},
    layout: wireLayoutInner,
  };

  return {
    stack: [
      wireSectionTitle('Сравнение трёх вариантов — схематично'),
      {
        table: {
          widths: ['*', '*', '*'],
          body: [[
            mini('Вариант 1\nSidebar', v1mini),
            mini('Вариант 2\nВерх. табы', v2mini),
            mini('Вариант 3\nПлитки', v3mini),
          ]],
        },
        layout: wireLayout,
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

// ── Tables (text) ────────────────────────────────────────────────────────────
const roleTable = {
  style: 'table',
  table: {
    widths: ['*', '*'],
    body: [
      [{ text: 'Роль', style: 'th' }, { text: 'Доступ', style: 'th' }],
      ['Продавец / курьер', 'Расчёт, договор, клиенты; KPI — только свои сделки'],
      ['Администратор', 'Аналитика команды, KPI всей команды, пользователи'],
      ['Супер-администратор', 'Настройки выкупа, индекс золота, полные доступы'],
    ],
  },
  layout: 'lightHorizontalLines',
  margin: [0, 6, 0, 10],
};

const navRoleTable = {
  style: 'table',
  table: {
    widths: ['*', 42, 42, 42],
    body: [
      [{ text: 'Раздел', style: 'th' }, { text: 'Продав.', style: 'th', alignment: 'center' }, { text: 'Админ', style: 'th', alignment: 'center' }, { text: 'Супер', style: 'th', alignment: 'center' }],
      ['Калькулятор, Договор, Клиенты', 'да', 'да', 'да'],
      ['Аналитика', 'обсудить', 'да', 'да'],
      ['Команда и KPI', 'только «я»', 'команда', 'да'],
      ['Индекс золота', '—', '—', 'да'],
      ['Настройки', '—', 'польз.', 'полные'],
    ],
  },
  layout: 'lightHorizontalLines',
  margin: [0, 6, 0, 10],
};

const compareTable = {
  style: 'table',
  table: {
    widths: ['*', 52, 52, 52],
    body: [
      [{ text: 'Критерий', style: 'th' }, { text: 'Вар. 1', style: 'th', alignment: 'center' }, { text: 'Вар. 2', style: 'th', alignment: 'center' }, { text: 'Вар. 3', style: 'th', alignment: 'center' }],
      ['Ощущение SaaS', '★★★★★', '★★★☆☆', '★★★★☆'],
      ['Удобство на ПК', '★★★★★', '★★★★☆', '★★★★☆'],
      ['Удобство в поле', '★★★★★', '★★★☆☆', '★★★★★'],
      ['Скорость внедрения', 'средняя', 'быстрее', 'дольше'],
    ],
  },
  layout: 'lightHorizontalLines',
  margin: [0, 6, 0, 10],
};

// ── Document ─────────────────────────────────────────────────────────────────
const doc = {
  pageSize: 'A4',
  pageMargins: [40, 48, 40, 48],
  defaultStyle: { font: 'Roboto', fontSize: 10, color: C.text },
  info: {
    title: 'Reaktivo.Pro — Архитектура интерфейса (Этап 6)',
    author: 'Reaktivo.Pro',
    subject: 'Варианты редизайна с визуальными схемами',
  },
  content: [
    {
      columns: [
        { width: '*', stack: [
          { text: 'REAKTIVO PRO', style: 'brand' },
          { text: 'Архитектура интерфейса · визуальные схемы', style: 'subtitle' },
        ]},
        { width: 'auto', text: '21.05.2026', style: 'date', alignment: 'right' },
      ],
      margin: [0, 0, 0, 12],
    },
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 3, color: C.gold }], margin: [0, 0, 0, 12] },
    p('Ниже — схемы экранов (wireframe), как будет выглядеть интерфейс. Серые блоки — навигация и карточки, золотые — активный раздел.', { color: C.muted }),

    h1('1. Сейчас'),
    p('Узкая колонка по центру, 7 кнопок-табов в две строки. На широком мониторе по бокам пусто.'),
    wireframeCurrentDesktop(),
    wireframeCurrentMobile(),

    { text: '', pageBreak: 'before' },

    h1('2. Вариант 1 — Sidebar (рекомендуем)'),
    p('Профессиональный SaaS: слева меню, справа весь контент. На телефоне — нижние иконки.'),
    wireframeV1Desktop(),
    wireframeV1Mobile(),
    h2('Кто что видит в меню'),
    navRoleTable,

    { text: '', pageBreak: 'before' },

    h1('3. Вариант 2 — Верхние табы'),
    p('Табы остаются сверху, но экран шире. У «Клиентов» и «Аналитики» — колонка фильтров слева.'),
    wireframeV2Desktop(),

    h1('4. Вариант 3 — Режимы по ролям'),
    p('После входа — 4 крупные плитки вместо списка из 7 разделов. У каждой роли свой набор.'),
    wireframeV3Dashboard(),

    { text: '', pageBreak: 'before' },

    wireframeCompareRow(),
    h1('5. Сравнение'),
    compareTable,
    {
      table: {
        widths: ['*'],
        body: [[{
          text: 'Рекомендация: Вариант 1 (sidebar на ПК + нижнее меню на телефоне). Для продавца можно упростить список разделов.',
          fillColor: C.goldLight,
          margin: [10, 10, 10, 10],
          bold: true,
          fontSize: 9.5,
        }]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12],
    },

    h1('6. Роли (кратко)'),
    roleTable,

    h1('7. Вопросы для согласования'),
    {
      ol: [
        'Какой вариант ближе: 1, 2, 3 или гибрид 1+3?',
        'Продавец видит аналитику компании или только свой KPI?',
        'Индекс золота — только супер-админ?',
        'На ПК важнее таблицы или карта в поле?',
      ].map((t) => ({ text: t, style: 'body', margin: [0, 3, 0, 3] })),
      margin: [0, 4, 0, 8],
    },
    p('Стоимость и сроки — после выбора варианта.', { italics: true, color: C.muted, alignment: 'center' }),
    p('reaktivo.pro', { alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 8, 0, 0] }),
  ],
  styles: {
    brand: { fontSize: 17, bold: true, color: C.gold },
    subtitle: { fontSize: 10, color: C.muted, margin: [0, 3, 0, 0] },
    date: { fontSize: 9, color: C.muted },
    h1: { fontSize: 12, bold: true },
    h2: { fontSize: 10, bold: true, color: C.gold },
    body: { fontSize: 9.5, lineHeight: 1.3 },
    th: { fontSize: 8.5, bold: true, fillColor: C.goldLight },
    wireCaption: { fontSize: 7.5, italics: true, color: C.muted },
    wireLabel: { fontSize: 8, bold: true, color: C.gold },
    wireSection: { fontSize: 8.5, bold: true, color: C.gold },
  },
};

const outPath = join(root, 'docs', 'Reaktivo_Pro_Архитектура_Этап6.pdf');
const buffer = await pdfMake.createPdf(doc).getBuffer();
writeFileSync(outPath, buffer);
console.log('PDF saved:', outPath);
