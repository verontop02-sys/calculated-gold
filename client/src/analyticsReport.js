/**
 * Печатный отчёт по аналитике — 1 в 1 с экраном «Аналитика»:
 * KPI со спарклайнами, денежный поток, пробы с долями, вес-динамика,
 * сотрудники с долей оборота, сделки по дням.
 */

import {
  escapeHtml,
  readTheme,
  formatReportDate,
  reportBlock,
  buildReportHtml,
  openReportPrint,
  lineAreaChartSvg,
  dualAreaChartSvg,
  barChartSvg,
  sparklineSvg,
  probeBarsHtml,
  kpiCardHtml,
} from './reportPrint.js';

function deltaPct(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function deltaHtml(cur, prev) {
  const pct = deltaPct(cur, prev);
  if (pct == null) return '<span class="r-delta r-delta--na">—</span>';
  const good = pct >= 0;
  return `<span class="r-delta r-delta--${good ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function fmtWeightGrossNet(r) {
  const g = r.weightGross != null ? Number(r.weightGross).toFixed(2) : '—';
  const n = r.weightNet != null ? Number(r.weightNet).toFixed(3) : '—';
  return `${g} / ${n}`;
}

const EXTRA_CSS = `
.r-op-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.r-op-cell__email { font-weight: 600; color: var(--text); font-size: 0.82rem; word-break: break-all; }
.r-op-cell__share { font-size: 0.7rem; color: var(--text-dim); }
.r-op-bar { height: 4px; border-radius: 999px; background: var(--surface); border: 1px solid var(--stroke-soft); overflow: hidden; max-width: 180px; }
.r-op-bar__fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent) 0%, var(--accent-dim) 100%); }
`;

export async function openAnalyticsReport(opts = {}) {
  const data = opts.data || {};
  const prev = opts.prevData?.totals || null;
  const t = data.totals || {};
  const fm = opts.formatMoney || ((x) => String(x));
  const theme = readTheme();
  const generatedAt = formatReportDate();
  const authorName = opts.authorName || '';
  const sections = new Set(opts.sections || ['summary']);
  const periodLabel = opts.periodLabel || '';
  const series = opts.moneySeries || [];
  const groupLabel = opts.group === 'week' ? 'по неделям' : opts.group === 'month' ? 'по месяцам' : 'по дням';

  const blocks = [];

  if (sections.has('summary')) {
    const avg = t.deals ? (t.sumRub || 0) / t.deals : null;
    const avgPrev = prev?.deals ? (prev.sumRub || 0) / prev.deals : null;
    blocks.push(
      reportBlock(
        `Сводка KPI · ${periodLabel}`,
        `<div class="r-kpis">
          ${kpiCardHtml({
            icon: 'money',
            hero: true,
            label: 'Оборот, ₽',
            valueHtml: fm(t.sumRub ?? 0),
            deltaHtml: deltaHtml(t.sumRub, prev?.sumRub),
            prevHtml: `пред.: ${prev?.sumRub != null ? fm(prev.sumRub) : '—'}`,
            sparkHtml: sparklineSvg(series, theme, { valueKey: 'sumRub', gradId: 'kSpSum' }),
          })}
          ${kpiCardHtml({
            icon: 'deals',
            tone: 'emerald',
            label: 'Сделок',
            valueHtml: String(t.deals ?? 0),
            deltaHtml: deltaHtml(t.deals, prev?.deals),
            prevHtml: `пред.: ${prev?.deals ?? '—'}`,
            sparkHtml: sparklineSvg(series, theme, { valueKey: 'count', gradId: 'kSpDeals' }),
          })}
          ${kpiCardHtml({
            icon: 'clients',
            label: 'Клиентов',
            valueHtml: String(t.uniqueCustomers ?? 0),
            deltaHtml: deltaHtml(t.uniqueCustomers, prev?.uniqueCustomers),
            prevHtml: `пред.: ${prev?.uniqueCustomers ?? '—'}`,
          })}
          ${kpiCardHtml({
            icon: 'avg',
            label: 'Средний чек',
            valueHtml: avg != null ? fm(Math.round(avg)) : '—',
            deltaHtml: deltaHtml(avg, avgPrev),
            prevHtml: `пред.: ${avgPrev != null ? fm(Math.round(avgPrev)) : '—'}`,
          })}
         </div>`
      )
    );
  }

  if (sections.has('series')) {
    blocks.push(
      reportBlock(
        null,
        `<div class="r-card r-card--keep">
          <div class="r-card__title">Денежный поток</div>
          <div class="r-card__sub">Оборот ${groupLabel}. Заливка показывает накопленный объём.</div>
          ${lineAreaChartSvg(series, theme, { valueKey: 'sumRub', gradId: 'anFlow' })}
        </div>`
      )
    );
  }

  if (sections.has('probe')) {
    const probes = data.byProbe || [];
    const totalDeals = probes.reduce((s, p) => s + (Number(p.count) || 0), 0);
    const probesWithShare = probes.map((p) => ({
      name: `${p.probe} пр.`,
      count: p.count ?? 0,
      share: totalDeals ? ((Number(p.count) || 0) / totalDeals) * 100 : 0,
    }));
    const rows = probes
      .map(
        (p) => `<tr>
          <td>${escapeHtml(String(p.probe ?? '—'))} пр.</td>
          <td class="num">${p.count ?? 0}</td>
          <td class="num">${fmtWeightGrossNet(p)}</td>
          <td class="num">${p.sumRub != null ? fm(p.sumRub) : '—'}</td>
        </tr>`
      )
      .join('');
    blocks.push(
      reportBlock(
        null,
        `<div class="r-card r-card--allow-break">
          <div class="r-card__title">Сделок по пробе</div>
          <div class="r-card__sub">По первой строке таблицы в договоре (лом, до трёх позиций). Сделок, вес, сумма по пробе.</div>
          ${probeBarsHtml(probesWithShare)}
          <div class="r-table-wrap">
            <table class="r-table">
              <thead><tr><th>Проба</th><th class="num">Сделок</th><th class="num">Вес, г (лом / чист.)</th><th class="num">Сумма, ₽</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="4" class="r-empty">Нет данных</td></tr>'}</tbody>
            </table>
          </div>
        </div>`
      )
    );
  }

  if (sections.has('series')) {
    const hasWeight = series.some((r) => r.weightGross != null || r.weightNet != null);
    if (hasWeight) {
      blocks.push(
        reportBlock(
          null,
          `<div class="r-card r-card--keep">
            <div class="r-card__title">Вес золота — динамика</div>
            <div class="r-card__sub">
              <span class="r-leg" style="--leg-c: var(--emerald)">общий, г</span>
              <span class="r-leg" style="--leg-c: var(--accent)">чистый, г</span>
              — по первой строке договора.
            </div>
            ${dualAreaChartSvg(series, theme, [
              { key: 'weightGross', color: theme.emerald, gradId: 'anWG' },
              { key: 'weightNet', color: theme.accent, gradId: 'anWN' },
            ])}
          </div>`
        )
      );
    }
  }

  if (sections.has('operators') && data.viewerScope !== 'self') {
    const ops = data.byOperator || [];
    const rows = ops
      .map((r) => {
        const share = t.sumRub ? Math.round(((r.sumRub || 0) / t.sumRub) * 100) : 0;
        return `<tr>
          <td>
            <div class="r-op-cell">
              <span class="r-op-cell__email">${escapeHtml(r.email || r.displayName || '—')}</span>
              <div class="r-op-bar"><div class="r-op-bar__fill" style="width:${Math.max(2, share)}%"></div></div>
              <span class="r-op-cell__share">${share}% оборота</span>
            </div>
          </td>
          <td class="num">${r.deals ?? 0}</td>
          <td class="num">${fm(r.sumRub ?? 0)}</td>
        </tr>`;
      })
      .join('');
    blocks.push(
      reportBlock(
        null,
        `<div class="r-card r-card--allow-break">
          <div class="r-card__title">Сотрудники</div>
          <div class="r-card__sub">Сделки и оборот по учётным записям за период</div>
          <div class="r-table-wrap">
            <table class="r-table">
              <thead><tr><th>Учётная запись</th><th class="num">Сделок</th><th class="num">Оборот, ₽</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="3" class="r-empty">Нет данных</td></tr>'}</tbody>
            </table>
          </div>
        </div>`
      )
    );
  }

  if (sections.has('series') && series.length > 1) {
    blocks.push(
      reportBlock(
        null,
        `<div class="r-card r-card--keep">
          <div class="r-card__title">Сделок по дням</div>
          <div class="r-card__sub">Распределение количества сделок по календарным дням периода.</div>
          ${barChartSvg(series, theme, { labelKey: 'x', valueKey: 'count' })}
        </div>`
      )
    );
  }

  if (!blocks.length) return false;

  const header = {
    sectionTitle: 'Аналитика',
    authorName,
    generatedAt,
  };

  return openReportPrint({
    title: `Аналитика — ${periodLabel}`,
    fileName: `Аналитика — ${periodLabel || 'отчёт'}`,
    bodyHtml: buildReportHtml({
      header,
      blocks,
    }),
    theme,
    extraCss: EXTRA_CSS,
  });
}
