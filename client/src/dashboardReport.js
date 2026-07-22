/**
 * Печатный PDF-отчёт по дашборду: сплошной поток, перенос только при нехватке места.
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

function deltaPct(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function deltaHtml(cur, prev, invert = false) {
  const pct = deltaPct(cur, prev);
  if (pct == null) return '<span class="r-delta r-delta--na">—</span>';
  const good = invert ? pct < 0 : pct >= 0;
  const arrow = pct >= 0 ? '▲' : '▼';
  return `<span class="r-delta r-delta--${good ? 'up' : 'down'}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function kpiCard(label, valueHtml, cur, prev, prevHtml, icon = 'money', tone = '', sparkHtml = '', hero = false) {
  return kpiCardHtml({
    icon,
    tone,
    hero,
    label,
    valueHtml,
    deltaHtml: deltaHtml(cur, prev),
    prevHtml: `пред.: ${prevHtml}`,
    sparkHtml,
  });
}

/* Стили 1 в 1 с классами сайта: .dx-card--today, .dx-probe, .dx-staff-row, .dx-market-row, .dx-deal */
const EXTRA_CSS = `
.r-card--today {
  position: relative; overflow: hidden;
  background: linear-gradient(168deg, var(--today-tint) 0%, var(--panel) 64%);
  border-color: rgba(254, 0, 0, 0.28);
}
.r-card--today .r-card__title { color: rgba(254, 80, 80, 0.85); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
.r-today { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.r-today__stat { display: flex; flex-direction: column; }
.r-today__v { font-family: var(--font-display); font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-strong); line-height: 1.1; }
.r-today__k { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }

.r-probes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media print { .r-probes { grid-template-columns: repeat(2, 1fr); } }
.r-probe {
  display: flex; flex-direction: column; gap: 5px; padding: 11px 13px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface); min-width: 0;
}
.r-probe--hot { border-color: var(--accent); }
.r-probe--hot .r-probe__name { color: var(--accent); }
.r-probe__name { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; color: var(--text-dim); }
.r-probe__price { font-size: 0.92rem; font-weight: 700; color: var(--text-strong); white-space: nowrap; }
.r-probe__bar { height: 3px; background: var(--stroke-soft); border-radius: 2px; overflow: hidden; }
.r-probe__bar-fill { height: 100%; border-radius: 2px; background: var(--accent-grad); }

.r-staff { display: flex; flex-direction: column; gap: 12px; }
.r-staff-row { display: flex; align-items: center; gap: 10px; min-width: 0; break-inside: avoid; page-break-inside: avoid; }
.r-staff-rank {
  width: 24px; height: 24px; border-radius: 7px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.74rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.r-staff-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.r-staff-name { font-size: 0.82rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-staff-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.r-staff-sum { font-size: 0.8rem; font-weight: 700; color: var(--text-strong); }
.r-staff-deals { font-size: 0.68rem; color: var(--text-dim); }

.r-market { display: flex; flex-direction: column; gap: 10px; }
.r-market-row {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface); min-width: 0;
  break-inside: avoid; page-break-inside: avoid;
}
.r-market-city { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-market-name { font-size: 0.86rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-market-region { font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-market-avg { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.r-adv { font-size: 0.78rem; font-weight: 700; padding: 3px 9px; border-radius: 7px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.r-adv--good { color: var(--emerald); background: var(--emerald-soft); }
.r-adv--bad { color: var(--crimson); background: var(--crimson-soft); }
.r-adv--na { color: var(--text-dim); background: var(--stroke-soft); }

.r-deals { display: flex; flex-direction: column; }
.r-deal {
  display: flex; align-items: center; gap: 11px; padding: 9px 6px; min-width: 0;
  border-bottom: 1px solid var(--stroke-soft);
  break-inside: avoid; page-break-inside: avoid;
}
.r-deal:last-child { border-bottom: none; }
.r-deal__avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent);
  font-size: 0.82rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.r-deal__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-deal__name { font-size: 0.84rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-deal__meta { font-size: 0.7rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-deal__right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
.r-deal__sum { font-size: 0.84rem; font-weight: 700; color: var(--text-strong); }
.r-deal__time { font-size: 0.68rem; color: var(--text-dim); }
.r-flow-chart { margin: 0 -4px; }
.r-cols--today { grid-template-columns: 0.9fr 1.1fr; }
`;

export async function openDashboardReport(d) {
  const t = readTheme();
  const fm = d.formatMoney || ((x) => String(x));
  const generatedAt = d.generatedAt || formatReportDate();
  const authorName = d.userName || '';
  const goldRate = d.gold?.value != null ? fm(d.gold.value) : null;
  const goldSource = d.gold?.source || '';

  const k = d.kpis || {};
  const flowSpark = sparklineSvg(d.flow || [], t, { valueKey: 'sum', gradId: 'dxSpSum' });
  const kpisHtml = [
    kpiCard('Оборот', fm(k.sum?.cur ?? 0), k.sum?.cur, k.sum?.prev, k.sum?.prev != null ? fm(k.sum.prev) : '—', 'money', '', flowSpark, true),
    kpiCard('Сделок', String(k.deals?.cur ?? 0), k.deals?.cur, k.deals?.prev, k.deals?.prev != null ? String(k.deals.prev) : '—', 'deals', 'emerald', sparklineSvg(d.flow || [], t, { valueKey: 'n', gradId: 'dxSpDeals' })),
    kpiCard('Клиентов', String(k.clients?.cur ?? 0), k.clients?.cur, k.clients?.prev, k.clients?.prev != null ? String(k.clients.prev) : '—', 'clients'),
    kpiCard('Средний чек', k.avg?.cur != null ? fm(Math.round(k.avg.cur)) : '—', k.avg?.cur, k.avg?.prev, k.avg?.prev != null ? fm(Math.round(k.avg.prev)) : '—', 'avg'),
  ].join('');

  const probesHtml = (d.probes || []).length
    ? (d.probes || [])
        .map(
          (p) => `
        <div class="r-probe${p.probe === 585 ? ' r-probe--hot' : ''}">
          <span class="r-probe__name">${p.probe}</span>
          <span class="r-probe__price mono-nums">${fm(Math.round(p.v))}</span>
          <div class="r-probe__bar"><div class="r-probe__bar-fill" style="width:${Math.round((p.probe / 999) * 100)}%"></div></div>
        </div>`
        )
        .join('')
    : '<div class="r-empty">Нет данных о курсе</div>';

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
            <span class="r-staff-sum mono-nums">${fm(s.sumRub || 0)}</span>
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

  const blocks = [
    reportBlock(`KPI · ${d.rangeLabel || ''}`, `<div class="r-kpis">${kpisHtml}</div>`),
    reportBlock(
      null,
      `<div class="r-cols r-cols--today">
        <div class="r-card r-card--keep r-card--today">
          <div class="r-card__title">Сегодня</div>
          <div class="r-today">
            <div class="r-today__stat"><span class="r-today__v mono-nums">${d.today?.count ?? 0}</span><span class="r-today__k">сделок</span></div>
            <div class="r-today__stat"><span class="r-today__v mono-nums">${fm(Number(d.today?.sumRub) || 0)}</span><span class="r-today__k">оборот за день</span></div>
          </div>
        </div>
        <div class="r-card r-card--keep">
          <div class="r-card__title">Выкуп по пробам</div>
          <div class="r-card__sub">За грамм при текущем курсе${d.buybackPercent != null ? ` · политика ${d.buybackPercent}%` : ''}</div>
          <div class="r-probes">${probesHtml}</div>
        </div>
      </div>`
    ),
    reportBlock(
      null,
      `<div class="r-card r-card--keep">
        <div class="r-card-head">
          <div>
            <div class="r-card__title">Денежный поток</div>
            <div class="r-card__sub">${escapeHtml(d.rangeLabel || '')}</div>
          </div>
        </div>
        <div class="r-flow-chart">${lineAreaChartSvg(d.flow, t, { valueKey: 'sum', gradId: 'rFlowGrad' })}</div>
      </div>`
    ),
    reportBlock(
      null,
      `<div class="r-cols">
        <div class="r-card r-card--allow-break">
          <div class="r-card__title">Команда</div>
          <div class="r-card__sub">Топ по обороту</div>
          <div class="r-staff">${staffHtml}</div>
        </div>
        <div class="r-card r-card--allow-break">
          <div class="r-card__title">Рынок · 585 проба</div>
          <div class="r-card__sub">Наша цена против средней конкурентов</div>
          <div class="r-market">${marketHtml}</div>
        </div>
      </div>`
    ),
    reportBlock(
      null,
      `<div class="r-card r-card--allow-break">
        <div class="r-card__title">Последние договоры</div>
        <div class="r-card__sub">${(d.recent || []).length} операций за период</div>
        <div class="r-deals">${recentHtml}</div>
      </div>`
    ),
  ];

  return openReportPrint({
    title: `Сводка дашборда — ${d.rangeLabel || ''}`,
    fileName: `Сводка дашборда — ${d.rangeLabel || 'отчёт'}`,
    bodyHtml: buildReportHtml({
      header: {
        sectionTitle: 'Сводка дашборда',
        authorName,
        generatedAt,
        goldRate,
        goldSource,
      },
      blocks,
    }),
    theme: t,
    extraCss: EXTRA_CSS,
  });
}
