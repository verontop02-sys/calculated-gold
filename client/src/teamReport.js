/**
 * Печатный отчёт «Команда и KPI» — 1 в 1 с экраном: KPI, динамика, рейтинг с медалями и долями.
 */

import {
  escapeHtml,
  readTheme,
  formatReportDate,
  reportBlock,
  buildReportHtml,
  openReportPrint,
  lineAreaChartSvg,
  sparklineSvg,
  kpiCardHtml,
} from './reportPrint.js';

const EXTRA_CSS = `
.r-rank { display: flex; flex-direction: column; gap: 8px; }
.r-rank__row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 14px;
  border: 1px solid var(--stroke-soft); background: var(--elevated);
  break-inside: avoid; page-break-inside: avoid;
}
.r-rank__row--high { border-color: rgba(254, 0, 0, 0.35); }
.r-rank__badge {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem; font-weight: 700; font-family: var(--font-display);
  background: var(--surface); color: var(--text-muted);
}
.r-rank__badge--1 { background: linear-gradient(135deg, #ffd86b, #f5a623); color: #5a3d00; font-size: 1.05rem; }
.r-rank__badge--2 { background: linear-gradient(135deg, #e2e8f0, #b9c2cf); color: #3a3f47; font-size: 1.05rem; }
.r-rank__badge--3 { background: linear-gradient(135deg, #f0b27a, #d98841); color: #4a2c0a; font-size: 1.05rem; }
.r-rank__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.r-rank__email { font-size: 0.88rem; font-weight: 600; color: var(--text); word-break: break-word; }
.r-rank__meta { display: flex; gap: 10px; font-size: 0.74rem; color: var(--text-muted); flex-wrap: wrap; }
.r-rank__right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; min-width: 130px; }
.r-rank__sum { font-size: 0.95rem; font-weight: 700; color: var(--text-strong); font-family: var(--font-display); }
.r-rank__share { display: flex; align-items: center; gap: 7px; width: 100%; }
.r-rank__share-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--surface); overflow: hidden; }
.r-rank__share-fill { height: 100%; border-radius: 999px; background: var(--accent-grad); }
.r-rank__share-pct { font-size: 0.72rem; color: var(--text-muted); min-width: 32px; text-align: right; }
`;

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export async function openTeamReport(opts = {}) {
  const data = opts.data || {};
  const fm = opts.formatMoney || ((x) => String(x));
  const theme = readTheme();
  const generatedAt = formatReportDate();
  const authorName = opts.authorName || '';
  const periodLabel = opts.periodLabel || '';
  const totals = data.totals || {};
  const ranking = data.operators || data.ranking || [];
  const series = opts.chartSeries || [];

  const rankRows = ranking
    .map((r, i) => {
      const rank = r.rank ?? i + 1;
      const share = r.shareRubPct != null
        ? Number(r.shareRubPct)
        : totals.sumRub
          ? Math.round(((r.sumRub || 0) / totals.sumRub) * 100)
          : 0;
      const name = r.email || r.displayName || r.name || '—';
      const weights =
        r.weightGrossSum != null || r.weightNetSum != null
          ? `<span>${(r.weightGrossSum ?? 0).toFixed(2)} / ${(r.weightNetSum ?? 0).toFixed(3)} г</span>`
          : '';
      return `
      <div class="r-rank__row${r.tier === 'high' || rank === 1 ? ' r-rank__row--high' : ''}">
        <span class="r-rank__badge${rank <= 3 ? ` r-rank__badge--${rank}` : ''}">${rank <= 3 ? MEDALS[rank] : rank}</span>
        <div class="r-rank__main">
          <span class="r-rank__email">${escapeHtml(name)}</span>
          <div class="r-rank__meta">
            <span>${r.deals ?? 0} сд.</span>
            ${weights}
          </div>
        </div>
        <div class="r-rank__right">
          <span class="r-rank__sum mono-nums">${fm(r.sumRub ?? 0)}</span>
          <div class="r-rank__share">
            <div class="r-rank__share-bar"><div class="r-rank__share-fill" style="width:${Math.min(100, Math.max(2, share))}%"></div></div>
            <span class="r-rank__share-pct">${share}%</span>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const blocks = [
    reportBlock(
      `Сводка · ${periodLabel}`,
      `<div class="r-kpis">
        ${kpiCardHtml({
          icon: 'money',
          hero: true,
          label: 'Оборот, ₽',
          valueHtml: fm(totals.sumRub ?? 0),
          sparkHtml: sparklineSvg(series, theme, { valueKey: 'sumRub', gradId: 'tmSpSum' }),
        })}
        ${kpiCardHtml({ icon: 'deals', tone: 'emerald', label: 'Сделок', valueHtml: String(totals.deals ?? 0) })}
        ${kpiCardHtml({ icon: 'clients', label: 'Сотрудников', valueHtml: String(ranking.length) })}
        ${kpiCardHtml({
          icon: 'avg',
          label: 'Средний чек',
          valueHtml: totals.deals ? fm(Math.round((totals.sumRub || 0) / totals.deals)) : '—',
        })}
     </div>`
    ),
    reportBlock(
      null,
      `<div class="r-card r-card--keep">
        <div class="r-card__title">Динамика оборота</div>
        <div class="r-card__sub">${escapeHtml(periodLabel)}</div>
        ${lineAreaChartSvg(series, theme, { valueKey: 'sumRub', gradId: 'tmFlow' })}
      </div>`
    ),
    reportBlock(
      null,
      `<div class="r-card r-card--allow-break">
        <div class="r-card__title">Рейтинг по обороту</div>
        <div class="r-card__sub">Сортировка по сумме · доля от оборота в этом отчёте</div>
        <div class="r-rank">${rankRows || '<div class="r-empty">Нет данных</div>'}</div>
      </div>`
    ),
  ];

  return openReportPrint({
    title: `Команда и KPI — ${periodLabel}`,
    fileName: `Команда и KPI — ${periodLabel || 'отчёт'}`,
    bodyHtml: buildReportHtml({
      header: {
        sectionTitle: 'Команда и KPI',
        authorName,
        generatedAt,
      },
      blocks,
    }),
    theme,
    extraCss: EXTRA_CSS,
  });
}
