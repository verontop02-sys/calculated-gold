import XLSX from 'xlsx';

function fmtRatio(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

export function buildGoldIndexExcelBuffer(overview, options = {}) {
  const wb = XLSX.utils.book_new();
  const filters = options?.filters || {};
  const historyRows = Array.isArray(options?.historyRows) ? options.historyRows : [];

  const summary = [
    ['Параметр', 'Значение'],
    ['Сформировано', new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })],
    ['Регион (фильтр)', filters.regionName || 'Все'],
    ['Период истории (с)', filters.from || '—'],
    ['Период истории (по)', filters.to || '—'],
    ['Биржа (эталон), ₽/г', overview?.goldRubPerGram ?? null],
    ['Выкуп лома, %', overview?.settingsSnapshot?.buybackPercentOfScrap ?? null],
    ['Городов', overview?.stats?.cityCount ?? 0],
    ['Охват населения', overview?.stats?.populationCovered ?? 0],
    ['Строк конкурентов', overview?.stats?.competitorRows ?? 0],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');

  const regions = (overview?.regions || []).map((r) => ({
    regionCode: r.regionCode || '',
    regionName: r.regionName || '',
    cityCount: r.cityCount ?? 0,
    ratioAvg: fmtRatio(r.ratioAvg),
    colorKey: r.colorKey || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regions), 'Regions');

  const cities = (overview?.cities || []).map((c) => ({
    id: c.id || '',
    regionCode: c.region_code || '',
    regionName: c.region_name || '',
    cityName: c.city_name || '',
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    population: c.population ?? null,
    ratioAvg: fmtRatio(c.ratioAvg),
    colorKey: c.colorKey || '',
    street: c.street || '',
    building: c.building || '',
    addressNote: c.address_note || '',
    geocodedLabel: c.geocoded_label || '',
    notes: c.notes || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cities), 'Cities');

  const competitors = [];
  for (const c of overview?.cities || []) {
    for (const co of c.competitors || []) {
      competitors.push({
        cityId: c.id || '',
        regionName: c.region_name || '',
        cityName: c.city_name || '',
        competitorId: co.id || '',
        companyName: co.companyName || '',
        measuredAt: co.measuredAt || '',
        ratioAvg: fmtRatio(co.ratioAvg),
        notes: co.notes || '',
        probes: JSON.stringify(co.probes || {}),
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(competitors), 'Competitors');

  const history = historyRows.map((r) => ({
    createdAt: r.created_at || '',
    entityType: r.entity_type || '',
    action: r.action || '',
    actorName: r.changed_by_name || '',
    actorEmail: r.changed_by_email || '',
    cityId: r.city_id || '',
    entityId: r.entity_id || '',
    payload: JSON.stringify(r.payload || {}),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(history), 'History');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
}
