/**
 * Общий движок печати отчётов REAKTIVO PRO.
 * HTML + CSS текущей темы → window.print → «Сохранить как PDF».
 * Шапка на каждом листе: лого, автор, раздел, дата (+ опц. курс).
 */

export function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    accent: v('--accent') || '#fe0000',
    accentDim: v('--accent-dim') || '#c40000',
    accentSoft: v('--accent-soft') || 'rgba(254,0,0,0.12)',
    accentStrong: v('--accent-strong') || '#ff2a2a',
    accentGrad: v('--accent-grad') || 'linear-gradient(135deg, #ff2a2a 0%, #fe0000 48%, #c40000 100%)',
    emerald: v('--emerald') || '#4ade80',
    emeraldSoft: v('--emerald-soft') || 'rgba(74,222,128,0.14)',
    crimson: v('--crimson') || '#ff5a63',
    crimsonSoft: v('--crimson-soft') || 'rgba(254,0,0,0.12)',
    textStrong: v('--text-strong') || '#fff',
    text: v('--text') || '#eef0f2',
    textMuted: v('--text-muted') || 'rgba(238,240,242,0.66)',
    textDim: v('--text-dim') || 'rgba(238,240,242,0.46)',
    stroke: v('--stroke') || 'rgba(255,255,255,0.1)',
    strokeSoft: v('--stroke-soft') || 'rgba(255,255,255,0.06)',
    strokeStrong: v('--stroke-strong') || 'rgba(255,255,255,0.20)',
    panel: v('--bg-panel-solid') || '#222427',
    surface: v('--surface') || 'rgba(36,38,42,0.75)',
    elevated: v('--surface-elevated') || '#2a2c30',
    bgDeep: v('--bg-deep') || '#141516',
    bgGradient: v('--bg-gradient') || '',
    shadowCard: v('--shadow-card') || '0 8px 32px rgba(0,0,0,0.5)',
  };
}

/** Иконки KPI — как чипы .dx-kpi__icon на сайте (stroke = currentColor). */
export const REPORT_ICONS = {
  money:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
  deals:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 11h2"/></svg>',
  clients:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  avg:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8"/><path d="M8 12h8"/><path d="M8 17h5"/></svg>',
  team:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
  gold:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2.25 2.25 0 0 1 0 4.5H9z"/><path d="M9 9v8"/><path d="M7.5 15.5H12"/></svg>',
};

/** KPI-карточка 1 в 1 как .dx-kpi/.an-kpi-card на сайте: иконка-чип, значение, дельта, спарклайн в фоне. */
export function kpiCardHtml({ icon = 'money', tone = '', hero = false, label, valueHtml, deltaHtml = '', prevHtml = '', sparkHtml = '' }) {
  const foot =
    deltaHtml || prevHtml
      ? `<div class="r-kpi__foot">${deltaHtml}${prevHtml ? `<span class="r-kpi__prev">${prevHtml}</span>` : ''}</div>`
      : '';
  return `
  <div class="r-kpi${hero ? ' r-kpi--hero' : ''}">
    <div class="r-kpi__top">
      <span class="r-kpi__icon${tone ? ` r-kpi__icon--${tone}` : ''}">${REPORT_ICONS[icon] || REPORT_ICONS.money}</span>
      <span class="r-kpi__label">${escapeHtml(label || '')}</span>
    </div>
    <div class="r-kpi__value mono-nums">${valueHtml}</div>
    ${foot}
    ${sparkHtml ? `<div class="r-kpi__spark">${sparkHtml}</div>` : ''}
  </div>`;
}

export function formatReportDate(d = new Date()) {
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Парсит #rgb/#rrggbb/rgb()/rgba() → {r,g,b,a}. Для html2canvas — без color-mix. */
function parseColorToRgba(input, fallback = { r: 254, g: 0, b: 0, a: 1 }) {
  const s = String(input || '').trim();
  if (!s) return { ...fallback };
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return {
      r: Math.round(Number(rgb[1])),
      g: Math.round(Number(rgb[2])),
      b: Math.round(Number(rgb[3])),
      a: rgb[4] != null ? Number(rgb[4]) : 1,
    };
  }
  return { ...fallback };
}

function rgbaStr({ r, g, b, a }) {
  const aa = Math.max(0, Math.min(1, a));
  if (aa >= 0.999) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(aa * 1000) / 1000})`;
}

/** color-mix(in srgb, c1 p%, transparent) ≈ c1 with alpha p/100 */
export function alphaColor(color, pct) {
  const c = parseColorToRgba(color);
  return rgbaStr({ ...c, a: (pct / 100) * (c.a ?? 1) });
}

/** color-mix(in srgb, c1 p%, c2) */
export function mixColors(c1, c2, pct) {
  const a = parseColorToRgba(c1);
  const b = parseColorToRgba(c2);
  const p = Math.max(0, Math.min(100, pct)) / 100;
  return rgbaStr({
    r: Math.round(a.r * p + b.r * (1 - p)),
    g: Math.round(a.g * p + b.g * (1 - p)),
    b: Math.round(a.b * p + b.b * (1 - p)),
    a: a.a * p + b.a * (1 - p),
  });
}

/**
 * Готовый PNG знака (красный квадрат + белая R).
 * Внешний SVG в html2canvas часто рисуется без path — только заливка.
 */
const REPORT_LOGO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAANXSURBVHic7dy/ahRhFIfhM2KZKiDkAlIshICtYNhACu/B2lxH8LJSaUxhJ6TPn4VEsNfCKmMRFEQdjTuzv53M85RbnDksL/MxMLvNbVVbEPIovQDTJkCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIkSIFECJEqARAmQKAESJUCiBEiUAIl6nF5gac+eVb14kd4i4/i46v379BZLGX+A83k1R0fpLSLar19HH6AjmCgBEiVAogRIlACJEiBRAiRKgEQJkCgBEiVAogRIlACJEiBRAiRKgEQJkCgBEiVAogRIlACJGv+v4gbUfv5c9eFDeo0/u7pKb7A0AXY5O6va309v8aA5gokSIFECJEqARHkI6fL0adXbt/3P/fKl6tWrqk+f+p89MgLs0GxsVM3ng8xuT0+r9vYmH6EjOKTZ3q46Pa3a2kqvEiXAoB8RPnmSXiVGgGHN9nbVu3eTjVCAa6CZzSYboQDXxFQjFOAamWKEAlwzU4tQgGtoShEKcE1NJUIBdmivr6u9vIxdv5nNqt68edARjj/Ath1u9mJRdXBQ7c3NcNf4i2Zn5+5OuLkZ22FI4w9waItF1d5eNsLZ7O6liAcY4fgDbJrhZ69DhLu7DzLC8Qe4KiIchADvQ4S9E+B9ibBXAuxye/v7zxeLqvm82o8fV73RD83ubtXhYez6fRFgl0cdX8/lZdXz59E74aAPYCsiwGV8P44n/lr9MgS4LBEuRYB9OD8X4X8SYF9E+F8E2CcR3psA+ybCexHgEET4zwQ4FBH+EwEOSYR/JcChibCTAFdBhH8kwFUR4W8JcJVE+AsBrpoIfzL+P6g8Oan29ethZl9cDDP3/PzufcKXL5ebc3LS10YxzW3VgL9rhG6OYKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESJQAiRIgUQIkSoBECZAoARIlQKIESNQ3LXTGvSZMSKoAAAAASUVORK5CYII=';

/** PNG data-URL логотипа для PDF (светлая и тёмная тема). */
export function reportLogoPngDataUrl() {
  return REPORT_LOGO_PNG;
}

/**
 * Загружает картинку (тот же origin /cities/*.jpg и т.п.) в data-URL,
 * чтобы html2canvas в iframe стабильно отрисовал её в PDF.
 */
export async function loadImageDataUrl(url) {
  if (!url) return '';
  if (String(url).startsWith('data:')) return String(url);
  try {
    const abs = new URL(url, window.location.origin).href;
    const res = await fetch(abs, { cache: 'force-cache' });
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/** Шапка отчёта (один раз в начале документа). */
export function sheetHeaderHtml({
  sectionTitle,
  authorName,
  generatedAt,
  goldRate,
  goldSource,
  logoSrc,
} = {}) {
  const rateBlock =
    goldRate != null && goldRate !== ''
      ? `<div class="r-head__rate">
          <div class="r-head__rate-label">Курс · ${escapeHtml(goldSource || 'биржа')}</div>
          <div class="r-head__rate-value">${escapeHtml(String(goldRate))}<span> / г</span></div>
        </div>`
      : '';

  // data-URL не прогоняем через escapeHtml — base64 безопасен, &amp; ломает src
  const src = logoSrc && !String(logoSrc).includes('.svg') ? logoSrc : REPORT_LOGO_PNG;

  return `
  <header class="r-head">
    <div class="r-head__brand">
      <img class="r-head__logo" src="${src}" alt="Reaktivo" width="42" height="42" decoding="sync"/>
      <div class="r-head__brand-text">
        <div class="r-head__brand-name">Reaktivo<span>.</span>PRO</div>
        <div class="r-head__brand-sub">отчёт</div>
      </div>
    </div>
    <div class="r-head__meta">
      <div class="r-head__section">${escapeHtml(sectionTitle || 'Раздел')}</div>
      <div class="r-head__who">
        ${authorName ? `Сформировал: <b>${escapeHtml(authorName)}</b>` : 'Сформировал: —'}
        · ${escapeHtml(generatedAt || formatReportDate())}
      </div>
    </div>
    ${rateBlock}
  </header>`;
}

/**
 * Блок раздела внутри потока (без page-break).
 * Перенос на следующую страницу — только если не хватает места.
 */
export function reportBlock(title, bodyHtml) {
  return `
  <section class="r-block">
    ${title ? `<p class="r-section-title">${escapeHtml(title)}</p>` : ''}
    ${bodyHtml}
  </section>`;
}

/**
 * Полное тело отчёта: одна шапка + поток блоков.
 * @deprecated sheetHtml — оставлен как алиас на reportBlock без повторной шапки
 */
export function sheetHtml(headerOpts, bodyHtml, { last = false } = {}) {
  // Совместимость: раньше каждый вызов делал новую страницу+шапку.
  // Теперь — только блок; шапку ставьте один раз через buildReportHtml.
  void headerOpts;
  void last;
  return reportBlock(null, bodyHtml);
}

/** Собирает HTML: шапка один раз, дальше сплошной поток.
 * Футер-строку не рисуем: дата и автор уже в шапке, а отдельная строка
 * при полностью заполненной последней странице создавала лишний пустой лист. */
export function buildReportHtml({ header, blocks = [] }) {
  return `
  ${sheetHeaderHtml(header)}
  <div class="r-flow">
    ${blocks.join('')}
  </div>`;
}

export function reportPageBg(t) {
  // Без серого --bg-deep: страница = цвет панелей (белый / тёмная панель)
  return t.panel || (t.theme === 'light' ? '#ffffff' : '#222427');
}

/** Ширина .r-doc в px (96dpi) под ориентацию страницы A4. */
export function reportDocWidth(orientation = 'landscape') {
  return orientation === 'landscape' ? 1130 : 794;
}

export function reportBaseCss(t, { orientation = 'landscape' } = {}) {
  const dark = t.theme !== 'light';
  const pageBg = reportPageBg(t);
  const docWidth = reportDocWidth(orientation);
  // html2canvas портит rgba/transparent → чёрные квадраты; в PDF только solid
  const surfaceSolid = dark ? mixColors('#ffffff', pageBg, 4) : (t.panel || '#ffffff');
  const elevatedSolid = dark ? mixColors('#ffffff', pageBg, 7) : (t.elevated || t.panel || '#ffffff');
  const accentSoft = mixColors(t.accent, pageBg, 14);
  const emeraldSoft = mixColors(t.emerald, pageBg, 16);
  const crimsonSoft = mixColors(t.crimson, pageBg, 14);
  const cardShadow = dark ? '0 2px 14px rgba(0,0,0,0.28)' : (t.shadowCard || '0 4px 18px rgba(0,0,0,0.08)');
  const cardBg = pageBg;
  const todayTint = mixColors(t.accent, pageBg, 16);
  const heroTint = mixColors(t.accent, pageBg, 10);
  return `
:root {
  --accent: ${t.accent}; --accent-dim: ${t.accentDim}; --accent-soft: ${accentSoft};
  --accent-strong: ${t.accentStrong || t.accent};
  --accent-grad: ${t.accentGrad || `linear-gradient(135deg, ${t.accentStrong || t.accent} 0%, ${t.accent} 48%, ${t.accentDim} 100%)`};
  --emerald: ${t.emerald}; --emerald-soft: ${emeraldSoft};
  --crimson: ${t.crimson}; --crimson-soft: ${crimsonSoft};
  --text-strong: ${t.textStrong}; --text: ${t.text}; --text-muted: ${t.textMuted}; --text-dim: ${t.textDim};
  --stroke: ${t.stroke}; --stroke-soft: ${t.strokeSoft}; --stroke-strong: ${t.strokeStrong || t.stroke};
  --panel: ${pageBg}; --surface: ${surfaceSolid}; --elevated: ${elevatedSolid}; --bg-deep: ${pageBg};
  --shadow-card: ${cardShadow};
  --today-tint: ${todayTint};
  --font-display: 'DM Sans', system-ui, -apple-system, sans-serif;
  --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { font-size: 13px; }
html, body {
  background: ${pageBg};
  color: var(--text);
  font-family: var(--font-ui); font-weight: 400; line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.r-doc { max-width: ${docWidth}px; margin: 0 auto; padding: 14px 16px 24px; }
.mono-nums { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }

/* SVG: без непрозрачного фона (html2canvas иначе рисует чёрный прямоугольник) */
svg, .r-chart, .r-spark-svg {
  background: transparent !important;
  background-color: transparent !important;
}

/* ── Шапка отчёта: карточка в стиле .dx-card ── */
.r-head {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${cardBg};
  box-shadow: var(--shadow-card);
  margin-bottom: 16px;
  break-inside: avoid; break-after: avoid;
}
.r-head__brand { display: flex; align-items: center; gap: 11px; flex-shrink: 0; }
.r-head__logo {
  width: 42px; height: 42px; border-radius: 11px;
  object-fit: fill; display: block; flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  background: #fe0000;
}
.r-head__brand-name {
  font-family: var(--font-display);
  font-size: 1.05rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.02em; line-height: 1.1;
}
.r-head__brand-name span { color: var(--accent); }
.r-head__brand-sub {
  font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 700; color: var(--text-dim); margin-top: 2px;
}
.r-head__meta { flex: 1; min-width: 0; }
.r-head__section {
  font-family: var(--font-display);
  font-size: 1.1rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.01em;
}
.r-head__who { font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; }
.r-head__who b { color: var(--text); font-weight: 600; }
.r-head__rate {
  text-align: right; padding: 9px 13px; border-radius: 12px; flex-shrink: 0;
  background: var(--accent-soft); border: 1px solid rgba(254, 0, 0, 0.28);
}
.r-head__rate-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-muted); }
.r-head__rate-value {
  font-family: var(--font-display);
  font-size: 1.15rem; font-weight: 700; color: var(--accent); letter-spacing: -0.02em;
}
.r-head__rate-value span { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }

/* ── Поток блоков ── */
.r-flow { display: flex; flex-direction: column; gap: 2px; }
.r-block { margin: 0 0 14px; break-inside: auto; page-break-inside: auto; }
.r-section-title {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--text-muted); margin: 4px 2px 10px;
  display: flex; align-items: center; gap: 7px;
  break-after: avoid; page-break-after: avoid;
}

/* ── Карточка 1 в 1 как .dx-card на сайте ── */
.r-card {
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${cardBg};
  box-shadow: var(--shadow-card);
  min-width: 0; margin-bottom: 14px;
  box-decoration-break: clone; -webkit-box-decoration-break: clone;
}
/* Небольшая карточка — целиком переносится, не режется */
.r-card--keep { break-inside: avoid; page-break-inside: avoid; }
.r-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.r-card__title {
  font-family: var(--font-display);
  font-size: 1.02rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text-strong);
}
.r-card__sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 3px; margin-bottom: 12px; }
.r-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.r-cols .r-card { margin-bottom: 0; }
.r-empty { padding: 22px 10px; text-align: center; font-size: 0.82rem; color: var(--text-dim); }

/* ── KPI 1 в 1 как .dx-kpi / .an-kpi-card ── */
.r-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.r-kpi {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column;
  padding: 18px 20px;
  border-radius: 18px;
  border: 1px solid var(--stroke-soft);
  background: ${cardBg};
  box-shadow: var(--shadow-card);
  break-inside: avoid;
}
.r-kpi--hero {
  background: linear-gradient(160deg, ${heroTint} 0%, ${cardBg} 55%);
  border-color: ${mixColors(t.accent, t.strokeSoft || 'rgba(255,255,255,0.06)', 24)};
}
.r-kpi__spark {
  position: absolute; left: 0; right: 0; bottom: 0; height: 38px;
  opacity: 0.9; pointer-events: none;
}
.r-spark-svg { display: block; width: 100%; height: 100%; }
.r-kpi__top { display: flex; align-items: center; gap: 9px; position: relative; }
.r-kpi__icon {
  width: 27px; height: 27px; border-radius: 9px;
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: inset 0 0 0 1px ${alphaColor(t.accent, 18)};
}
.r-kpi__icon--emerald {
  background: var(--emerald-soft); color: var(--emerald);
  box-shadow: inset 0 0 0 1px ${alphaColor(t.emerald, 18)};
}
.r-kpi__label {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
  font-weight: 700; color: var(--text-muted);
}
.r-kpi__value {
  font-family: var(--font-display);
  font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-strong);
  line-height: 1.1; margin: 8px 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  position: relative;
}
.r-kpi__foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; position: relative; padding-bottom: 26px; }
.r-kpi__foot:last-child { padding-bottom: 0; }
.r-kpi:not(:has(.r-kpi__spark)) .r-kpi__foot { padding-bottom: 0; }
.r-kpi__prev { font-size: 0.7rem; color: var(--text-dim); }

/* ── Прогресс-бары долей 1 в 1 как .an-probe-bar ── */
.r-probe-bars { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 14px; }
.r-probe-bar { display: flex; flex-direction: column; gap: 4px; break-inside: avoid; }
.r-probe-bar__head { display: flex; justify-content: space-between; font-size: 0.82rem; }
.r-probe-bar__name { font-weight: 600; color: var(--text); }
.r-probe-bar__count { color: var(--text-muted); font-size: 0.78rem; }
.r-probe-bar__track {
  height: 8px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--stroke-soft); overflow: hidden;
}
.r-probe-bar__fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%);
}
/* Легенда-пилюли как .an-leg-pill */
.r-leg { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; color: var(--text-muted); margin-right: 10px; }
.r-leg::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--leg-c, var(--accent)); box-shadow: 0 0 6px var(--leg-c, var(--accent)); }

/* ── Дельта 1 в 1 как .dx-delta ── */
.r-delta {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 0.74rem; font-weight: 700; padding: 3px 8px; border-radius: 7px;
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.r-delta--up { color: var(--emerald); background: var(--emerald-soft); }
.r-delta--down { color: var(--crimson); background: var(--crimson-soft); }
.r-delta--na { color: var(--text-dim); background: var(--stroke-soft); }

/* ── Прогресс-бары как .dx-staff-bar ── */
.r-bar { height: 4px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.r-bar__fill { height: 100%; border-radius: 2px; background: var(--accent-grad); }

/* ── Таблица 1 в 1 как .cg-table на сайте ── */
.r-table-wrap {
  border-radius: 14px; border: 1px solid var(--stroke-soft);
  background: var(--surface); overflow: hidden; margin-top: 4px;
}
.r-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; line-height: 1.4; color: var(--text); }
.r-table thead th {
  background: linear-gradient(180deg, var(--panel) 0%, var(--surface) 100%);
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  color: var(--text-muted);
  padding: 11px 14px; text-align: left;
  border-bottom: 1px solid var(--stroke-strong); white-space: nowrap;
}
.r-table thead th.num { text-align: right; }
.r-table tbody td {
  padding: 10px 14px; border-bottom: 1px solid var(--stroke-soft);
  vertical-align: middle; color: var(--text);
}
.r-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
.r-table tbody tr:last-child td { border-bottom: none; }
.r-table tbody tr:nth-child(even) td { background: ${surfaceSolid}; }
.r-table .num { text-align: right; font-variant-numeric: tabular-nums; }

.r-map {
  width: 100%; border-radius: 14px; overflow: hidden; border: 1px solid var(--stroke-soft);
  background: var(--elevated); display: block; object-fit: cover;
}
.r-map--gi { min-height: 240px; max-height: 320px; }
.r-chart svg { display: block; width: 100%; height: auto; min-height: 180px; }

/* Последний блок без нижнего отступа — чтобы не выталкивал пустую страницу */
.r-flow > .r-block:last-child { margin-bottom: 0; }
.r-flow > .r-block:last-child .r-card:last-child { margin-bottom: 0; }

@page { size: A4 ${orientation}; margin: 9mm; }
@media print {
  html, body { background: ${pageBg} !important; }
  .r-doc { padding: 0; max-width: 100%; }
  /* KPI-сетка может рваться между карточками — иначе пустая страница после шапки */
  .r-kpis { grid-template-columns: repeat(2, 1fr); gap: 10px; break-inside: auto; page-break-inside: auto; }
  .r-kpi { break-inside: avoid; page-break-inside: avoid; }
  /* Колонки — в столбик на A4, каждая карточка отдельно */
  .r-cols { grid-template-columns: 1fr !important; gap: 12px; break-inside: auto; page-break-inside: auto; }
  .r-cols .r-card { margin-bottom: 0; }
  .r-card--keep { break-inside: avoid; page-break-inside: avoid; }
  /* Длинные списки/таблицы — тянутся, строки не рвутся */
  .r-card { break-inside: auto; page-break-inside: auto; }
  .r-card--allow-break { break-inside: auto; page-break-inside: auto; }
  .r-card--allow-break .r-table tr,
  .r-deal, .r-staff-row, .r-market-row, .r-comp-block { break-inside: avoid; page-break-inside: avoid; }
  .r-block { break-inside: auto; page-break-inside: auto; }
  .r-head { break-inside: avoid; break-after: avoid; }
}
`;
}

/**
 * Элементы, которые нельзя резать посередине при нарезке canvas→PDF.
 * (CSS break-inside не работает: режем изображение, а не layout.)
 */
function collectPdfKeepUnits(docEl, scale) {
  const root = docEl.getBoundingClientRect();
  const y0 = root.top;
  const shadowPad = Math.max(4, Math.round(10 * scale));
  const units = [];

  const add = (el, hard = true) => {
    if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (r.height < 2 || r.width < 2) return;
    const top = Math.round((r.top - y0) * scale) - (hard ? Math.round(2 * scale) : 0);
    const bottom = Math.round((r.bottom - y0) * scale) + (hard ? shadowPad : 0);
    if (bottom <= top) return;
    units.push({ top: Math.max(0, top), bottom, hard: !!hard });
  };

  docEl.querySelectorAll('.r-head, .r-section-title, .r-kpis').forEach((el) => add(el, true));
  docEl.querySelectorAll('.r-kpi').forEach((el) => add(el, true));
  docEl.querySelectorAll('.r-card--keep, .r-chart').forEach((el) => add(el, true));
  docEl.querySelectorAll('.r-card--allow-break').forEach((el) => {
    add(el, false);
    el.querySelectorAll(
      'thead, tbody tr, .r-deal, .r-staff-row, .r-market-row, .r-comp-block, .r-probe-bar, .r-rank-card, .r-op-cell'
    ).forEach((child) => add(child, true));
  });
  docEl
    .querySelectorAll('.r-card:not(.r-card--keep):not(.r-card--allow-break)')
    .forEach((el) => add(el, true));

  units.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  return units;
}

/** Ищет Y-срез страницы так, чтобы не резать графики/карточки пополам. */
function findPdfPageCut(startY, pageH, totalH, units) {
  const limit = Math.min(startY + pageH, totalH);
  if (limit >= totalH - 1) return totalH;

  const minContent = Math.max(48, Math.floor(pageH * 0.22));
  const straddlers = units.filter((u) => u.top < limit && u.bottom > limit);
  if (straddlers.length) {
    const hard = straddlers.filter((u) => u.hard);

    if (hard.length) {
      const startedHere = hard.filter((u) => u.top <= startY + 4);
      if (startedHere.length) {
        const needBottom = Math.max(...startedHere.map((u) => u.bottom));
        if (needBottom - startY <= pageH) return Math.min(totalH, needBottom);
        return limit;
      }
      const cutBefore = Math.min(...hard.map((u) => u.top));
      if (cutBefore > startY + minContent) return cutBefore;
      return limit;
    }

    // Только soft (длинная allow-break карточка): режем после последней целой строки/блока
    const soft = straddlers.reduce((a, b) => (a.top <= b.top ? a : b));
    let lastChildEnd = null;
    for (const u of units) {
      if (!u.hard) continue;
      if (u.top >= soft.top - 2 && u.bottom <= limit && u.bottom > startY) {
        lastChildEnd = u.bottom;
      }
    }
    if (lastChildEnd != null && lastChildEnd > startY + minContent) return lastChildEnd;
    if (soft.top > startY + minContent) return soft.top;
    return limit;
  }

  // Нет пересечения: лучше резать после последнего целого блока (чистый низ страницы)
  let lastEnd = null;
  for (const u of units) {
    if (u.bottom <= limit && u.bottom > startY) lastEnd = u.bottom;
  }
  if (lastEnd != null && lastEnd >= startY + pageH * 0.38) {
    const next = units.find((u) => u.top >= lastEnd - 1);
    if (next && next.bottom <= limit) return limit;
    if (next && next.top < limit && next.bottom > limit) return next.top;
    return lastEnd;
  }
  return limit;
}

/**
 * Собирает HTML-отчёт в настоящий PDF и сразу скачивает файл.
 * Рендер в изолированном iframe (без CSS приложения с color-mix — html2canvas его не умеет).
 * @param {{ title: string, bodyHtml: string, theme?: object, extraCss?: string, fileName?: string }} opts
 * @returns {Promise<boolean>}
 */
export async function openReportPrint({
  title,
  bodyHtml,
  theme,
  extraCss = '',
  fileName,
  orientation = 'landscape',
} = {}) {
  const t = theme || readTheme();
  const safeName = String(fileName || title || 'Отчёт — Reaktivo.PRO')
    .replace(/[\\/:*?"<>|]+/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const pdfName = /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;

  // bg-gradient из темы часто содержит color-mix — для html2canvas не используем
  const pageBg = reportPageBg(t);
  const docWidth = reportDocWidth(orientation);
  const css = `${reportBaseCss(t, { orientation })}${extraCss}
html, body { margin: 0 !important; padding: 0 !important; background: ${pageBg} !important; background-image: none !important; }
.r-doc { max-width: ${docWidth}px !important; width: ${docWidth}px !important; margin: 0 auto !important; padding: 16px 18px 20px !important; background: ${pageBg} !important; }
`;

  const html = `<!DOCTYPE html>
<html lang="ru" data-theme="${escapeHtml(t.theme)}">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title || 'Отчёт')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>${css}</style>
</head>
<body>
<div class="r-doc">${bodyHtml}</div>
</body>
</html>`;

  const frameWidth = docWidth + 70;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-14000px;top:0;width:${frameWidth}px;height:2400px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error('iframe document unavailable');
    idoc.open();
    idoc.write(html);
    idoc.close();

    // Гарантируем PNG-логотип (не SVG) до захвата
    idoc.querySelectorAll('img.r-head__logo').forEach((img) => {
      img.setAttribute('src', REPORT_LOGO_PNG);
      img.removeAttribute('crossorigin');
    });

    // Шрифты + картинки внутри iframe
    await new Promise((resolve) => {
      const done = () => resolve();
      if (idoc.readyState === 'complete') setTimeout(done, 50);
      else iframe.addEventListener('load', () => setTimeout(done, 50), { once: true });
    });
    if (idoc.fonts?.ready) {
      try { await idoc.fonts.ready; } catch { /* ignore */ }
    }
    const imgs = Array.from(idoc.images || []);
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete && img.naturalWidth
            ? Promise.resolve()
            : new Promise((res) => {
                img.addEventListener('load', res, { once: true });
                img.addEventListener('error', res, { once: true });
              })
      )
    );
    await new Promise((r) => setTimeout(r, 120));

    const docEl = idoc.querySelector('.r-doc');
    if (!docEl) throw new Error('report root missing');

    // Подгоняем высоту iframe под контент
    const fullH = Math.max(docEl.scrollHeight, docEl.offsetHeight) + 40;
    iframe.style.height = `${Math.min(Math.max(fullH, 400), 20000)}px`;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(docEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: pageBg,
      logging: false,
      windowWidth: frameWidth,
      scrollX: 0,
      scrollY: 0,
      onclone(clonedDoc) {
        // На всякий случай вычищаем color-mix / color() из inline и <style> клона
        clonedDoc.querySelectorAll('style').forEach((st) => {
          st.textContent = String(st.textContent || '')
            .replace(/color-mix\([^)]+\)/gi, 'transparent')
            .replace(/\bcolor\([^)]+\)/gi, 'transparent');
        });
        clonedDoc.querySelectorAll('svg').forEach((svg) => {
          svg.style.setProperty('background', 'transparent', 'important');
          svg.style.setProperty('background-color', 'transparent', 'important');
        });
      },
    });

    const scaleX = canvas.width / Math.max(1, docEl.offsetWidth);
    const keepUnits = collectPdfKeepUnits(docEl, scaleX);

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const pageBgRgb = parseColorToRgba(pageBg, { r: 255, g: 255, b: 255, a: 1 });

    const fillPdfPage = () => {
      pdf.setFillColor(pageBgRgb.r, pageBgRgb.g, pageBgRgb.b);
      pdf.rect(0, 0, pageW, pageH, 'F');
    };

    const pageCanvasH = Math.max(1, Math.floor((contentH / ((canvas.height * contentW) / canvas.width)) * canvas.height));
    let srcY = 0;
    let pageIndex = 0;
    while (srcY < canvas.height - 2) {
      let cutY = findPdfPageCut(srcY, pageCanvasH, canvas.height, keepUnits);
      if (cutY <= srcY) cutY = Math.min(canvas.height, srcY + pageCanvasH);
      const sliceH = Math.max(1, Math.min(cutY, canvas.height) - srcY);
      if (sliceH <= 1) break;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext('2d');
      ctx.fillStyle = pageBg;
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      const sliceMmH = (sliceH * contentW) / canvas.width;
      if (pageIndex > 0 && sliceMmH < 6) break;

      if (pageIndex > 0) pdf.addPage();
      fillPdfPage();
      pdf.addImage(
        pageCanvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        margin,
        margin,
        contentW,
        sliceMmH,
        undefined,
        'FAST'
      );

      srcY += sliceH;
      pageIndex += 1;
      if (pageIndex > 40) break;
    }

    pdf.save(pdfName);
    return true;
  } catch (err) {
    console.error('[reportPrint] PDF download failed', err);
    return false;
  } finally {
    iframe.remove();
  }
}

/** Снимок Leaflet-карты (тайлы + маркеры). При CORS — null. */
export async function captureLeafletMap(mapContainer) {
  if (!mapContainer) return null;
  const rect = mapContainer.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (w < 40 || h < 40) return null;

  const imgs = mapContainer.querySelectorAll('.leaflet-tile-pane img');
  await Promise.all(
    Array.from(imgs).map(
      (img) =>
        img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise((res) => {
              img.addEventListener('load', res, { once: true });
              img.addEventListener('error', res, { once: true });
            })
    )
  );

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel-solid').trim() || '#222427';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const drawEl = (el) => {
    if (!(el instanceof HTMLImageElement) && !(el instanceof HTMLCanvasElement)) return;
    if (el instanceof HTMLImageElement && (!el.complete || !el.naturalWidth)) return;
    const r = el.getBoundingClientRect();
    const x = r.left - rect.left;
    const y = r.top - rect.top;
    try {
      ctx.drawImage(el, x, y, r.width, r.height);
    } catch {
      /* tainted */
    }
  };

  mapContainer.querySelectorAll('.leaflet-tile-pane img, .leaflet-overlay-pane canvas, .leaflet-marker-pane img').forEach(drawEl);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function axisFmt(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

/**
 * Monotone-cubic сглаживание (как type="monotone" в Recharts).
 * pts: [{x, y}] → SVG path "M... C..." без перелётов за пределы данных.
 */
function monotonePath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  const dx = [];
  const dy = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    slope.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);
  let d = `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i].x;
    const y0 = pts[i].y;
    const x1 = pts[i + 1].x;
    const y1 = pts[i + 1].y;
    const h = (x1 - x0) / 3;
    d += ` C${(x0 + h).toFixed(2)} ${(y0 + m[i] * h).toFixed(2)} ${(x1 - h).toFixed(2)} ${(y1 - m[i + 1] * h).toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return d;
}

function xTickLabel(row) {
  const d = String(row.x ?? row.day ?? '');
  if (d.length >= 10) return `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  return d;
}

/** Мини-спарклайн для KPI-карточки — как .an-kpi-card__spark / .dx-kpi__spark на сайте. */
export function sparklineSvg(series, t, { valueKey = 'sumRub', gradId = 'spark' } = {}) {
  const rows = Array.isArray(series) ? series : [];
  if (rows.length < 2) return '';
  const W = 220;
  const H = 38;
  const vals = rows.map((s) => Number(s[valueKey] ?? 0) || 0);
  const max = Math.max(...vals, 1);
  const pts = rows.map((_, i) => ({
    x: (i / (rows.length - 1)) * W,
    y: 4 + (H - 6) - (vals[i] / max) * (H - 6),
  }));
  const line = monotonePath(pts);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  return `
    <svg class="r-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" style="background:transparent">
      <rect width="${W}" height="${H}" fill="none"/>
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${gradId})"/>
      <path d="${line}" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

/**
 * Площадной график 1 в 1 как AreaChart на сайте:
 * monotone-кривая, градиентная заливка, свечение линии, пунктирная сетка, оси.
 */
export function lineAreaChartSvg(series, t, { valueKey = 'sum', gradId = 'rGrad', height = 210, color } = {}) {
  const rows = Array.isArray(series) ? series : [];
  if (rows.length < 2) return '<div class="r-empty">Нет данных за период</div>';
  const c = color || t.accent;
  const W = 760;
  const H = height;
  const pad = { top: 14, right: 14, bottom: 26, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const vals = rows.map((s) => Number(s[valueKey] ?? s.sum ?? s.sumRub) || 0);
  const max = Math.max(...vals, 1);
  const X = (i) => pad.left + (i / (rows.length - 1)) * plotW;
  const Y = (val) => pad.top + plotH - (val / max) * plotH;

  const pts = rows.map((_, i) => ({ x: X(i), y: Y(vals[i]) }));
  const line = monotonePath(pts);
  const area = `${line} L${X(rows.length - 1).toFixed(2)} ${Y(0).toFixed(2)} L${X(0).toFixed(2)} ${Y(0).toFixed(2)} Z`;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const val = (max / 4) * i;
    const y = Y(val).toFixed(1);
    grid += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${t.strokeSoft}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`;
    grid += `<text x="${pad.left - 8}" y="${Number(y) + 3}" text-anchor="end" font-size="10" fill="${t.textMuted}">${axisFmt(val)}</text>`;
  }

  const step = Math.max(1, Math.ceil(rows.length / 7));
  let xlabels = '';
  for (let i = 0; i < rows.length; i += step) {
    xlabels += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${t.textMuted}">${escapeHtml(xTickLabel(rows[i]))}</text>`;
  }

  return `
    <svg class="r-chart" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${W}" height="${H}" fill="none"/>
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${c}" stop-opacity="0.55"/>
          <stop offset="60%" stop-color="${c}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#${gradId})"/>
      <path d="${line}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${xlabels}
    </svg>`;
}

/**
 * Двойной area-график (вес общий/чистый) — как ComposedChart «Вес золота — динамика».
 * seriesDefs: [{ key, color, gradId, label }]
 */
export function dualAreaChartSvg(series, t, seriesDefs, { height = 230 } = {}) {
  const rows = Array.isArray(series) ? series : [];
  if (rows.length < 2 || !seriesDefs?.length) return '<div class="r-empty">Нет данных за период</div>';
  const W = 760;
  const H = height;
  const pad = { top: 14, right: 14, bottom: 26, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const allVals = seriesDefs.flatMap((d) => rows.map((r) => Number(r[d.key]) || 0));
  const max = Math.max(...allVals, 1);
  const X = (i) => pad.left + (i / (rows.length - 1)) * plotW;
  const Y = (val) => pad.top + plotH - (val / max) * plotH;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const val = (max / 4) * i;
    const y = Y(val).toFixed(1);
    grid += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${t.strokeSoft}" stroke-width="1" stroke-dasharray="3 7"/>`;
    grid += `<text x="${pad.left - 8}" y="${Number(y) + 3}" text-anchor="end" font-size="10" fill="${t.textMuted}">${axisFmt(val)}</text>`;
  }

  const step = Math.max(1, Math.ceil(rows.length / 7));
  let xlabels = '';
  for (let i = 0; i < rows.length; i += step) {
    xlabels += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${t.textMuted}">${escapeHtml(xTickLabel(rows[i]))}</text>`;
  }

  let defs = '';
  let paths = '';
  seriesDefs.forEach((d) => {
    const vals = rows.map((r) => Number(r[d.key]) || 0);
    const pts = rows.map((_, i) => ({ x: X(i), y: Y(vals[i]) }));
    const line = monotonePath(pts);
    const area = `${line} L${X(rows.length - 1).toFixed(2)} ${Y(0).toFixed(2)} L${X(0).toFixed(2)} ${Y(0).toFixed(2)} Z`;
    defs += `
      <linearGradient id="${d.gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${d.color}" stop-opacity="0.42"/>
        <stop offset="65%" stop-color="${d.color}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${d.color}" stop-opacity="0"/>
      </linearGradient>`;
    paths += `
      <path d="${area}" fill="url(#${d.gradId})"/>
      <path d="${line}" fill="none" stroke="${d.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  return `
    <svg class="r-chart" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${W}" height="${H}" fill="none"/>
      <defs>${defs}</defs>
      ${grid}
      ${paths}
      ${xlabels}
    </svg>`;
}

/**
 * Бар-чарт 1 в 1 как BarChart «Сделок по дням»: сетка, оси,
 * скруглённые сверху столбики, прямые подписи дат.
 */
export function barChartSvg(items, t, { labelKey = 'name', valueKey = 'value', height = 210, color } = {}) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 31);
  if (!rows.length) return '<div class="r-empty">Нет данных</div>';
  const c = color || t.accent;
  const W = 760;
  const H = height;
  const pad = { top: 14, right: 12, bottom: 26, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 1);
  const bw = plotW / rows.length;
  const barW = Math.min(28, Math.max(8, bw * 0.6));

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const val = (max / 4) * i;
    const y = (pad.top + plotH - (val / max) * plotH).toFixed(1);
    grid += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${t.strokeSoft}" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>`;
    grid += `<text x="${pad.left - 8}" y="${Number(y) + 3}" text-anchor="end" font-size="10" fill="${t.textMuted}">${axisFmt(val)}</text>`;
  }

  let bars = '';
  let labels = '';
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((r, i) => {
    const v = Number(r[valueKey]) || 0;
    const h = Math.max(1.5, (v / max) * plotH);
    const x = pad.left + i * bw + (bw - barW) / 2;
    const y = pad.top + plotH - h;
    const rx = Math.min(4, barW / 2);
    const fill = v > 0 ? c : t.strokeSoft;
    // скругление только сверху
    bars += `<path d="M${x.toFixed(1)} ${(y + rx).toFixed(1)} q0 -${rx} ${rx} -${rx} h${(barW - 2 * rx).toFixed(1)} q${rx} 0 ${rx} ${rx} v${(h - rx).toFixed(1)} h-${barW.toFixed(1)} Z" fill="${fill}"/>`;
    if (i % labelStep === 0) {
      const raw = String(r[labelKey] ?? '');
      const isDate = /^\d{4}-\d{2}-\d{2}/.test(raw);
      if (isDate) {
        labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${t.textMuted}">${escapeHtml(`${raw.slice(8, 10)}.${raw.slice(5, 7)}`)}</text>`;
      } else {
        const cx = (x + barW / 2).toFixed(1);
        labels += `<text x="${cx}" y="${H - 8}" text-anchor="end" font-size="9.5" fill="${t.textMuted}" transform="rotate(-30 ${cx} ${H - 8})">${escapeHtml(raw.slice(0, 14))}</text>`;
      }
    }
  });

  return `
    <svg class="r-chart" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" style="background:transparent">
      <rect width="${W}" height="${H}" fill="none"/>
      ${grid}
      ${bars}
      ${labels}
    </svg>`;
}

/** Прогресс-бары долей 1 в 1 как .an-probe-bar на сайте. */
export function probeBarsHtml(items, { labelKey = 'name', countKey = 'count', shareKey = 'share' } = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return '';
  return `<div class="r-probe-bars">${rows
    .map((p) => {
      const share = Number(p[shareKey]) || 0;
      return `
      <div class="r-probe-bar">
        <div class="r-probe-bar__head">
          <span class="r-probe-bar__name">${escapeHtml(String(p[labelKey] ?? ''))}</span>
          <span class="r-probe-bar__count mono-nums">${escapeHtml(String(p[countKey] ?? ''))} · ${share.toFixed(0)}%</span>
        </div>
        <div class="r-probe-bar__track"><div class="r-probe-bar__fill" style="width:${Math.max(2, share)}%"></div></div>
      </div>`;
    })
    .join('')}</div>`;
}
