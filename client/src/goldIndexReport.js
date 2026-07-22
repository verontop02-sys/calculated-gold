/**
 * Печатный отчёт «Индекс золота»: KPI, карта, регионы, города.
 */

import {
  escapeHtml,
  readTheme,
  formatReportDate,
  reportBlock,
  buildReportHtml,
  openReportPrint,
  captureLeafletMap,
  barChartSvg,
  kpiCardHtml,
} from './reportPrint.js';

const EXTRA_CSS = `
.r-gi-map-chart { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.r-gi-map-chart .r-card { margin-bottom: 0; }
.r-comp-block {
  margin-bottom: 10px; padding: 12px 14px;
  border-radius: 12px; border: 1px solid var(--stroke-soft); background: var(--surface);
  break-inside: avoid; page-break-inside: avoid;
}
.r-comp-block:last-child { margin-bottom: 0; }
.r-comp-city { font-weight: 600; color: var(--text); font-size: 0.86rem; margin-bottom: 2px; }
.r-comp-meta { font-size: 0.68rem; color: var(--text-dim); margin-bottom: 8px; }
@media print {
  .r-gi-map-chart { grid-template-columns: 1fr; }
}
`;

function fmtRatio(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}

export async function openGoldIndexReport(opts = {}) {
  const data = opts.data || {};
  const fm = opts.formatMoney || ((x) => String(x));
  const t = readTheme();
  const generatedAt = formatReportDate();
  const authorName = opts.authorName || '';
  const goldRate = data.goldRubPerGram != null ? fm(data.goldRubPerGram) : null;

  let mapDataUrl = null;
  try {
    mapDataUrl = await captureLeafletMap(opts.mapEl || null);
  } catch {
    mapDataUrl = null;
  }

  const regionsChart = opts.regionsChart || (data.regions || []).map((r) => ({
    name: r.regionName || r.region_name || '—',
    value: Number(r.ratioAvg) || 0,
  }));

  const kpiHtml = `
    <div class="r-kpis">
      ${kpiCardHtml({
        icon: 'gold',
        label: 'Биржа (эталон)',
        valueHtml: `${data.goldRubPerGram != null ? fm(data.goldRubPerGram) : '—'} <span style="font-size:0.72rem;color:var(--text-muted)">₽/г</span>`,
      })}
      ${kpiCardHtml({
        icon: 'money',
        label: 'Выкуп лома',
        valueHtml: `${data.settingsSnapshot?.buybackPercentOfScrap ?? '—'}<span style="font-size:0.72rem;color:var(--text-muted)">%</span>`,
      })}
      ${kpiCardHtml({
        icon: 'team',
        tone: 'emerald',
        label: 'Городов',
        valueHtml: String(data.stats?.cityCount ?? (data.cities || []).length ?? 0),
      })}
      ${kpiCardHtml({
        icon: 'clients',
        label: 'Охват населения',
        valueHtml:
          data.stats?.populationCovered != null
            ? new Intl.NumberFormat('ru-RU').format(data.stats.populationCovered)
            : '—',
      })}
    </div>`;

  const mapInner = mapDataUrl
    ? `<img class="r-map r-map--gi" src="${mapDataUrl}" alt=""/>`
    : '';

  const mapChartHtml =
    mapInner || regionsChart.length
      ? `<div class="r-gi-map-chart">
          ${mapInner ? `<div class="r-card r-card--keep">${mapInner}</div>` : ''}
          <div class="r-card r-card--keep">
            <div class="r-card__title">Индекс по регионам</div>
            <div class="r-card__sub">${regionsChart.length} регион(ов)</div>
            ${barChartSvg(regionsChart, t, { labelKey: 'name', valueKey: 'value', gradId: 'giBar' })}
          </div>
        </div>`
      : '';

  const regionRows = (data.regions || [])
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.regionName || '')}</td>
        <td class="num">${r.cityCount ?? '—'}</td>
        <td class="num">${fmtRatio(r.ratioAvg)}</td>
      </tr>`
    )
    .join('');

  const cities = data.cities || [];
  const citiesHtml = cities.length
    ? cities
        .map((c) => {
          const comps = (c.competitors || [])
            .map((co) => {
              const probesStr = Object.entries(co.probes || {})
                .map(([k, v]) => `${k}: ${fm(typeof v === 'number' ? v : parseFloat(v))}`)
                .join('; ');
              return `<div style="margin:4px 0 6px;font-size:0.74rem">
                <b>${escapeHtml(co.companyName || '—')}</b>
                ${probesStr ? ` · ${escapeHtml(probesStr)}` : ''}
                ${co.address ? `<div style="color:var(--text-dim)">${escapeHtml(co.address)}</div>` : ''}
              </div>`;
            })
            .join('');
          const streetLine = [c.street, c.building].filter(Boolean).join(', ');
          return `<div class="r-comp-block">
            <div class="r-comp-city">${escapeHtml(c.city_name || c.cityName || c.name || 'Город')}</div>
            <div class="r-comp-meta">${escapeHtml(c.region_name || c.regionName || '')}${streetLine ? ` · ${escapeHtml(streetLine)}` : ''}</div>
            ${comps || '<div class="r-empty" style="padding:6px 0">Нет конкурентов</div>'}
          </div>`;
        })
        .join('')
    : '<div class="r-empty">Нет городов</div>';

  const blocks = [
    reportBlock(null, kpiHtml),
    ...(mapChartHtml ? [reportBlock(null, mapChartHtml)] : []),
    reportBlock(
      null,
      `<div class="r-card r-card--allow-break">
        <div class="r-card__title">Сводка по регионам</div>
        <div class="r-card__sub">${(data.regions || []).length} регион(ов)</div>
        <div class="r-table-wrap">
          <table class="r-table">
            <thead><tr><th>Регион</th><th class="num">Городов</th><th class="num">Индекс ср.</th></tr></thead>
            <tbody>${regionRows || '<tr><td colspan="3" class="r-empty">Нет данных</td></tr>'}</tbody>
          </table>
        </div>
      </div>`
    ),
    reportBlock(
      null,
      `<div class="r-card r-card--allow-break">
        <div class="r-card__title">Города и конкуренты</div>
        <div class="r-card__sub">${cities.length} город(ов)</div>
        ${citiesHtml}
      </div>`
    ),
  ];

  return openReportPrint({
    title: 'Индекс золота — Reaktivo.PRO',
    fileName: 'Индекс золота — Reaktivo.PRO',
    bodyHtml: buildReportHtml({
      header: {
        sectionTitle: 'Индекс золота',
        authorName,
        generatedAt,
        goldRate,
        goldSource: 'биржа',
      },
      blocks,
    }),
    theme: t,
    extraCss: EXTRA_CSS,
  });
}
