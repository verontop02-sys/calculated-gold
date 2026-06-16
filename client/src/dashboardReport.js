/**
 * Генерация печатного PDF-отчёта по дашборду.
 *
 * Подход: открываем новое окно с самодостаточным HTML, в который инлайнятся
 * актуальные цвета текущей темы (читаем через getComputedStyle), и вызываем
 * нативную печать браузера → «Сохранить как PDF». Так отчёт получает векторный
 * текст, точные цвета текущей темы и полностью управляемую вёрстку без лишних
 * зазоров. Графики перерисованы как inline-SVG из тех же данных, что на странице.
 */

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deltaPct(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function axisFmt(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    accent: v('--accent') || '#8b7cff',
    accentDim: v('--accent-dim') || '#5d4fc7',
    accentSoft: v('--accent-soft') || 'rgba(139,124,255,0.13)',
    accentGrad: v('--accent-grad') || 'linear-gradient(135deg,#a799ff,#8b7cff)',
    emerald: v('--emerald') || '#4ade80',
    emeraldSoft: v('--emerald-soft') || 'rgba(74,222,128,0.14)',
    crimson: v('--crimson') || '#fb7185',
    crimsonSoft: v('--crimson-soft') || 'rgba(251,113,133,0.12)',
    textStrong: v('--text-strong') || '#fff',
    text: v('--text') || '#f4f5f7',
    textMuted: v('--text-muted') || 'rgba(244,245,247,0.68)',
    textDim: v('--text-dim') || 'rgba(244,245,247,0.48)',
    stroke: v('--stroke') || 'rgba(255,255,255,0.1)',
    strokeSoft: v('--stroke-soft') || 'rgba(255,255,255,0.06)',
    panel: v('--bg-panel-solid') || '#16181e',
    elevated: v('--surface-elevated') || '#1b1e25',
    bgDeep: v('--bg-deep') || '#0c0d11',
  };
}

/** Площадной график денежного потока как inline-SVG. */
function flowChartSvg(series, t) {
  if (!Array.isArray(series) || series.length < 2) {
    return '<div class="r-empty">Нет данных за период</div>';
  }
  const W = 760;
  const H = 200;
  const pad = { top: 14, right: 14, bottom: 24, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(...series.map((s) => s.sum), 1);
  const X = (i) => pad.left + (i / (series.length - 1)) * plotW;
  const Y = (val) => pad.top + plotH - (val / max) * plotH;

  let line = '';
  series.forEach((s, i) => {
    line += `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)} ${Y(s.sum).toFixed(1)} `;
  });
  const area =
    `M${X(0).toFixed(1)} ${Y(0).toFixed(1)} ` +
    series.map((s, i) => `L${X(i).toFixed(1)} ${Y(s.sum).toFixed(1)}`).join(' ') +
    ` L${X(series.length - 1).toFixed(1)} ${Y(0).toFixed(1)} Z`;

  const GRID = 4;
  let grid = '';
  for (let i = 0; i <= GRID; i++) {
    const val = (max / GRID) * i;
    const y = Y(val).toFixed(1);
    grid += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${t.strokeSoft}" stroke-width="1" stroke-dasharray="3 5"/>`;
    grid += `<text x="${pad.left - 8}" y="${Number(y) + 3}" text-anchor="end" font-size="9.5" fill="${t.textDim}">${axisFmt(val)}</text>`;
  }

  const step = Math.max(1, Math.ceil(series.length / 7));
  let xlabels = '';
  for (let i = 0; i < series.length; i += step) {
    const d = String(series[i].x || '');
    const lbl = d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d;
    xlabels += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="${t.textDim}">${escapeHtml(lbl)}</text>`;
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">
      <defs>
        <linearGradient id="rFlowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.38"/>
          <stop offset="72%" stop-color="${t.accent}" stop-opacity="0.07"/>
          <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#rFlowGrad)"/>
      <path d="${line}" fill="none" stroke="${t.accent}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      ${xlabels}
    </svg>`;
}

function deltaHtml(cur, prev, invert = false) {
  const pct = deltaPct(cur, prev);
  if (pct == null) return '<span class="r-delta r-delta--na">—</span>';
  const good = invert ? pct < 0 : pct >= 0;
  const arrow = pct >= 0 ? '▲' : '▼';
  return `<span class="r-delta r-delta--${good ? 'up' : 'down'}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function kpiCard(label, valueHtml, cur, prev, prevHtml, invert = false) {
  return `
    <div class="r-kpi">
      <div class="r-kpi__label">${escapeHtml(label)}</div>
      <div class="r-kpi__value">${valueHtml}</div>
      <div class="r-kpi__foot">
        ${deltaHtml(cur, prev, invert)}
        <span class="r-kpi__prev">пред.: ${prevHtml}</span>
      </div>
    </div>`;
}

/**
 * @param {object} d данные отчёта (см. Dashboard.exportReport)
 */
export function openDashboardReport(d) {
  const t = readTheme();
  const fm = d.formatMoney || ((x) => String(x));
  const k = d.kpis || {};

  const kpisHtml = [
    kpiCard('Оборот, 30 дней', fm(k.sum?.cur ?? 0), k.sum?.cur, k.sum?.prev, k.sum?.prev != null ? fm(k.sum.prev) : '—'),
    kpiCard('Сделок', String(k.deals?.cur ?? 0), k.deals?.cur, k.deals?.prev, k.deals?.prev != null ? String(k.deals.prev) : '—'),
    kpiCard('Клиентов', String(k.clients?.cur ?? 0), k.clients?.cur, k.clients?.prev, k.clients?.prev != null ? String(k.clients.prev) : '—'),
    kpiCard('Средний чек', k.avg?.cur != null ? fm(Math.round(k.avg.cur)) : '—', k.avg?.cur, k.avg?.prev, k.avg?.prev != null ? fm(Math.round(k.avg.prev)) : '—'),
  ].join('');

  const staffHtml = (d.staff || []).length
    ? (d.staff || [])
        .map(
          (s, i) => `
        <div class="r-staff-row">
          <span class="r-staff-rank">${i + 1}</span>
          <div class="r-staff-mid">
            <span class="r-staff-name">${escapeHtml(s.name)}</span>
            <div class="r-bar"><div class="r-bar__fill" style="width:${Math.max(3, s.share || 0)}%"></div></div>
          </div>
          <div class="r-staff-right">
            <span class="r-staff-sum">${fm(s.sumRub || 0)}</span>
            <span class="r-staff-deals">${s.deals || 0} сд. · ${s.share || 0}%</span>
          </div>
        </div>`
        )
        .join('')
    : `<div class="r-empty">${d.viewerScope === 'self' ? 'Доступна только своя статистика' : 'Нет данных'}</div>`;

  const marketHtml = (d.market || []).length
    ? (d.market || [])
        .map(
          (c) => `
        <div class="r-market-row">
          <div class="r-market-city">
            <span class="r-market-name">${escapeHtml(c.name)}</span>
            <span class="r-market-region">${escapeHtml(c.region || '')}${c.comps != null ? ` · ${c.comps} конк.` : ''}</span>
          </div>
          <span class="r-market-avg">${c.avg != null ? fm(Math.round(c.avg)) : '—'}</span>
          ${
            c.adv != null
              ? `<span class="r-adv r-adv--${c.adv >= 0 ? 'good' : 'bad'}">${c.adv >= 0 ? '+' : ''}${c.adv.toFixed(1)}%</span>`
              : '<span class="r-adv r-adv--na">—</span>'
          }
        </div>`
        )
        .join('')
    : '<div class="r-empty">Нет данных по рынку</div>';

  const probesHtml = (d.probes || []).length
    ? (d.probes || [])
        .map(
          (p) => `
        <div class="r-probe${p.probe === 585 ? ' r-probe--hot' : ''}">
          <span class="r-probe__name">${p.probe}</span>
          <span class="r-probe__price">${fm(Math.round(p.v))}</span>
          <div class="r-bar"><div class="r-bar__fill" style="width:${Math.round((p.probe / 999) * 100)}%"></div></div>
        </div>`
        )
        .join('')
    : '<div class="r-empty">Нет данных о курсе</div>';

  const recentHtml = (d.recent || []).length
    ? (d.recent || [])
        .map(
          (r) => `
        <div class="r-deal">
          <span class="r-deal__avatar">${escapeHtml((r.name || '?').trim().slice(0, 1).toUpperCase())}</span>
          <div class="r-deal__mid">
            <span class="r-deal__name">${escapeHtml(r.name || 'Без имени')}</span>
            <span class="r-deal__meta">${r.contractNo ? `№ ${escapeHtml(r.contractNo)}` : 'Договор'}${r.probe ? ` · ${escapeHtml(r.probe)} пр.` : ''}${r.weight ? ` · ${escapeHtml(r.weight)} г` : ''}</span>
          </div>
          <div class="r-deal__right">
            <span class="r-deal__sum">${fm(r.sum || 0)}</span>
            <span class="r-deal__time">${escapeHtml(r.time || '')}</span>
          </div>
        </div>`
        )
        .join('')
    : '<div class="r-empty">Сделок пока нет</div>';

  const html = `<!DOCTYPE html>
<html lang="ru" data-theme="${t.theme}">
<head>
<meta charset="UTF-8"/>
<title>Сводка дашборда — ${escapeHtml(d.rangeLabel || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
:root {
  --accent: ${t.accent}; --accent-dim: ${t.accentDim}; --accent-soft: ${t.accentSoft};
  --emerald: ${t.emerald}; --emerald-soft: ${t.emeraldSoft};
  --crimson: ${t.crimson}; --crimson-soft: ${t.crimsonSoft};
  --text-strong: ${t.textStrong}; --text: ${t.text}; --text-muted: ${t.textMuted}; --text-dim: ${t.textDim};
  --stroke: ${t.stroke}; --stroke-soft: ${t.strokeSoft};
  --panel: ${t.panel}; --elevated: ${t.elevated}; --bg-deep: ${t.bgDeep};
}
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: var(--bg-deep); color: var(--text); font-family: 'Inter', system-ui, sans-serif; font-size: 12px; }
.r-display { font-family: 'DM Sans', system-ui, sans-serif; }
.r-page { max-width: 794px; margin: 0 auto; padding: 22px 24px 28px; }

/* Header */
.r-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 18px 20px; border-radius: 16px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 18%, var(--panel)), var(--panel) 62%);
  border: 1px solid var(--stroke); margin-bottom: 14px;
}
.r-head__title { font-family: 'DM Sans', sans-serif; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-strong); }
.r-head__sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 3px; }
.r-quote {
  text-align: right; padding: 10px 16px; border-radius: 12px;
  background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  flex-shrink: 0;
}
.r-quote__label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; color: var(--text-muted); }
.r-quote__value { font-family: 'DM Sans', sans-serif; font-size: 1.35rem; font-weight: 700; color: var(--accent); letter-spacing: -0.02em; }
.r-quote__per { font-size: 0.7rem; color: var(--text-muted); }

/* Section title */
.r-section-title {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 700; color: var(--text-muted); margin: 16px 2px 8px;
}

/* KPI */
.r-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.r-kpi { padding: 14px; border-radius: 14px; border: 1px solid var(--stroke-soft); background: var(--panel); }
.r-kpi__label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--text-muted); }
.r-kpi__value { font-family: 'DM Sans', sans-serif; font-size: 1.32rem; font-weight: 700; color: var(--text-strong); letter-spacing: -0.02em; margin: 7px 0 8px; }
.r-kpi__foot { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.r-kpi__prev { font-size: 0.64rem; color: var(--text-dim); }
.r-delta { display: inline-flex; align-items: center; gap: 3px; font-size: 0.66rem; font-weight: 700; padding: 2px 7px; border-radius: 6px; }
.r-delta--up { color: var(--emerald); background: var(--emerald-soft); }
.r-delta--down { color: var(--crimson); background: var(--crimson-soft); }
.r-delta--na { color: var(--text-dim); background: var(--stroke-soft); }

/* Cards */
.r-card { padding: 16px 18px; border-radius: 16px; border: 1px solid var(--stroke-soft); background: var(--panel); }
.r-card__title { font-family: 'DM Sans', sans-serif; font-size: 0.96rem; font-weight: 700; color: var(--text-strong); }
.r-card__sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; margin-bottom: 12px; }

.r-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.r-today { display: flex; gap: 28px; }
.r-today__v { font-family: 'DM Sans', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--text-strong); display: block; line-height: 1.1; }
.r-today__k { font-size: 0.7rem; color: var(--text-muted); }

/* Bars */
.r-bar { height: 4px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.r-bar__fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, var(--accent-dim), var(--accent)); }

/* Staff */
.r-staff-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--stroke-soft); }
.r-staff-row:last-child { border-bottom: none; }
.r-staff-rank { width: 22px; height: 22px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-staff-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.r-staff-name { font-size: 0.78rem; font-weight: 600; color: var(--text); }
.r-staff-right { text-align: right; flex-shrink: 0; }
.r-staff-sum { font-size: 0.78rem; font-weight: 700; color: var(--text-strong); display: block; }
.r-staff-deals { font-size: 0.62rem; color: var(--text-dim); }

/* Market */
.r-market-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--stroke-soft); }
.r-market-row:last-child { border-bottom: none; }
.r-market-city { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-market-name { font-size: 0.78rem; font-weight: 600; color: var(--text); }
.r-market-region { font-size: 0.62rem; color: var(--text-dim); }
.r-market-avg { font-size: 0.76rem; font-weight: 600; color: var(--text-muted); }
.r-adv { font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 6px; }
.r-adv--good { color: var(--emerald); background: var(--emerald-soft); }
.r-adv--bad { color: var(--crimson); background: var(--crimson-soft); }
.r-adv--na { color: var(--text-dim); background: var(--stroke-soft); }

/* Probes */
.r-probes { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.r-probe { display: flex; flex-direction: column; gap: 5px; padding: 10px 11px; border-radius: 11px; border: 1px solid var(--stroke-soft); background: var(--elevated); }
.r-probe--hot { border-color: var(--accent); }
.r-probe--hot .r-probe__name { color: var(--accent); }
.r-probe__name { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.04em; color: var(--text-dim); }
.r-probe__price { font-size: 0.82rem; font-weight: 700; color: var(--text-strong); }

/* Deals */
.r-deal { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--stroke-soft); }
.r-deal:last-child { border-bottom: none; }
.r-deal__avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 0.74rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-deal__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-deal__name { font-size: 0.78rem; font-weight: 600; color: var(--text); }
.r-deal__meta { font-size: 0.64rem; color: var(--text-dim); }
.r-deal__right { text-align: right; flex-shrink: 0; }
.r-deal__sum { font-size: 0.78rem; font-weight: 700; color: var(--text-strong); display: block; }
.r-deal__time { font-size: 0.62rem; color: var(--text-dim); }

.r-empty { padding: 16px; text-align: center; font-size: 0.74rem; color: var(--text-dim); }
.r-flow-chart { margin: 0 -4px; }

.r-footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--stroke-soft); display: flex; justify-content: space-between; font-size: 0.66rem; color: var(--text-dim); }

@page { size: A4 portrait; margin: 10mm; }
@media print {
  html, body { background: var(--bg-deep); }
  .r-page { padding: 0; max-width: 100%; }
  .r-card, .r-kpi, .r-section { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="r-page">
  <div class="r-head">
    <div>
      <div class="r-head__title">Сводка дашборда</div>
      <div class="r-head__sub">За последние 30 дней · ${escapeHtml(d.rangeLabel || '')}${d.userName ? ` · ${escapeHtml(d.userName)}` : ''}</div>
    </div>
    <div class="r-quote">
      <div class="r-quote__label">Курс золота · ${escapeHtml(d.gold?.source || 'ЦБ РФ')}</div>
      <div class="r-quote__value">${d.gold?.value != null ? fm(d.gold.value) : '—'}<span class="r-quote__per"> / г</span></div>
    </div>
  </div>

  <div class="r-kpis">${kpisHtml}</div>

  <div class="r-section-title">Сегодня и денежный поток</div>
  <div class="r-cols">
    <div class="r-card">
      <div class="r-card__title">Сегодня</div>
      <div class="r-card__sub">Показатели за текущий день</div>
      <div class="r-today">
        <div><span class="r-today__v">${d.today?.count ?? 0}</span><span class="r-today__k">сделок</span></div>
        <div><span class="r-today__v">${fm(Number(d.today?.sumRub) || 0)}</span><span class="r-today__k">оборот</span></div>
      </div>
    </div>
    <div class="r-card">
      <div class="r-card__title">Выкуп по пробам</div>
      <div class="r-card__sub">За грамм при текущем курсе${d.buybackPercent != null ? ` · политика ${d.buybackPercent}%` : ''}</div>
      <div class="r-probes">${probesHtml}</div>
    </div>
  </div>

  <div class="r-section-title">Денежный поток · оборот по дням</div>
  <div class="r-card">
    <div class="r-flow-chart">${flowChartSvg(d.flow, t)}</div>
  </div>

  <div class="r-section-title">Команда и рынок</div>
  <div class="r-cols">
    <div class="r-card">
      <div class="r-card__title">Команда</div>
      <div class="r-card__sub">Топ по обороту за 30 дней</div>
      ${staffHtml}
    </div>
    <div class="r-card">
      <div class="r-card__title">Рынок · 585 проба</div>
      <div class="r-card__sub">Наша цена против средней конкурентов</div>
      ${marketHtml}
    </div>
  </div>

  <div class="r-section-title">Последние договоры</div>
  <div class="r-card">${recentHtml}</div>

  <div class="r-footer">
    <span>REAKTIVO PRO · отчёт по дашборду</span>
    <span>Сформировано ${escapeHtml(d.generatedAt || '')}</span>
  </div>
</div>
<script>
  window.addEventListener('load', function () {
    var done = function () { try { window.focus(); window.print(); } catch (e) {} };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(done, 150); });
    } else {
      setTimeout(done, 400);
    }
  });
</script>
</body>
</html>`;

  // ВАЖНО: без 'noopener'/'noreferrer' — иначе window.open вернёт null
  // и записать HTML в окно будет невозможно (откроется пустой about:blank).
  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
  }

  // Фолбэк: всплывающее окно заблокировано — формируем blob и открываем его.
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w2 = window.open(url, '_blank');
    if (w2) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
  return false;
}
