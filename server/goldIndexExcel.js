import XLSX from 'xlsx';

function fmtRatio(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

export function buildGoldIndexExcelBuffer(overview, options = {}) {
  const wb = XLSX.utils.book_new();
  const filters = options?.filters || {};
  const historyRows = Array.isArray(options?.historyRows) ? options.historyRows : [];
  const probes = Array.isArray(overview?.probesSuggested) && overview.probesSuggested.length
    ? overview.probesSuggested
    : [375, 500, 583, 585, 750, 875, 900, 916, 958, 999];

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
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка');

  const regions = [
    ['Код региона', 'Регион', 'Городов', 'Средний индекс', 'Цвет'],
    ...(overview?.regions || []).map((r) => [
      r.regionCode || '',
      r.regionName || '',
      r.cityCount ?? 0,
      fmtRatio(r.ratioAvg),
      r.colorKey || '',
    ]),
  ];
  const wsRegions = XLSX.utils.aoa_to_sheet(regions);
  wsRegions['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsRegions, 'Регионы');

  const cities = [
    [
      'ID города',
      'Код региона',
      'Регион',
      'Город',
      'Широта',
      'Долгота',
      'Население',
      'Средний индекс',
      'Цвет',
      'Улица',
      'Дом',
      'Уточнение адреса',
      'Подпись точки',
      'Заметки',
    ],
    ...(overview?.cities || []).map((c) => [
      c.id || '',
      c.region_code || '',
      c.region_name || '',
      c.city_name || '',
      c.lat ?? null,
      c.lng ?? null,
      c.population ?? null,
      fmtRatio(c.ratioAvg),
      c.colorKey || '',
      c.street || '',
      c.building || '',
      c.address_note || '',
      c.geocoded_label || '',
      c.notes || '',
    ]),
  ];
  const wsCities = XLSX.utils.aoa_to_sheet(cities);
  wsCities['!cols'] = [
    { wch: 38 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 11 }, { wch: 11 }, { wch: 12 },
    { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 36 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCities, 'Города');

  const competitors = [[
    'ID города',
    'Регион',
    'Город',
    'ID конкурента',
    'Компания',
    'Дата замера',
    'Средний индекс',
    ...probes.map((p) => `${p} ₽/г`),
    'Заметки',
  ]];
  for (const c of overview?.cities || []) {
    for (const co of c.competitors || []) {
      competitors.push([
        c.id || '',
        c.region_name || '',
        c.city_name || '',
        co.id || '',
        co.companyName || '',
        co.measuredAt || '',
        fmtRatio(co.ratioAvg),
        ...probes.map((p) => {
          const v = co?.probes?.[String(p)];
          return v == null ? null : Number(v);
        }),
        co.notes || '',
      ]);
    }
  }
  const wsCompetitors = XLSX.utils.aoa_to_sheet(competitors);
  wsCompetitors['!cols'] = [
    { wch: 38 }, { wch: 20 }, { wch: 18 }, { wch: 38 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
    ...probes.map(() => ({ wch: 10 })), { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCompetitors, 'Конкуренты');

  const history = [
    ['Когда', 'Сущность', 'Действие', 'Кто изменил', 'Email', 'ID города', 'ID объекта', 'Данные'],
    ...historyRows.map((r) => [
      r.created_at || '',
      r.entity_type || '',
      r.action || '',
      r.changed_by_name || '',
      r.changed_by_email || '',
      r.city_id || '',
      r.entity_id || '',
      JSON.stringify(r.payload || {}),
    ]),
  ];
  const wsHistory = XLSX.utils.aoa_to_sheet(history);
  wsHistory['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 38 }, { wch: 38 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsHistory, 'История');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
}
