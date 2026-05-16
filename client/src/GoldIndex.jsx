import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BarChart, Bar,
  AreaChart, Area, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell,
} from 'recharts';
import { api } from './api.js';

// ── GeoJSON helpers ──────────────────────────────────────────────────────────
const GEO_URL = '/russia-regions.geojson';

/** HASC "RU.AD" → ISO "RU-AD" */
function hascToIso(hasc) {
  return (hasc || '').replace('.', '-').toUpperCase();
}

/** Normalise Russian region name for loose matching */
function normRu(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Match a GeoJSON feature to one of our region records.
 * Tries HASC→ISO code first, then loose name match.
 */
function matchFeatureToRegion(props, regionList) {
  if (!props || !regionList?.length) return null;
  const iso = hascToIso(props.hasc);
  if (iso) {
    const exact = regionList.find((r) => (r.regionCode || '').toUpperCase() === iso);
    if (exact) return exact;
  }
  // Fallback: name containment (useful if user entered non-standard code)
  const gNorm = normRu(props.name_ru || props.name || '');
  if (!gNorm) return null;
  return (
    regionList.find((r) => {
      const rn = normRu(r.regionName || '');
      return rn && (rn.includes(gNorm) || gNorm.includes(rn));
    }) || null
  );
}

const CHART_COLORS = ['#e8c547', '#38bdf8', '#f87171', '#4ade80', '#a78bfa', '#fb923c', '#34d399'];
const COMMON_PROBES = ['375', '500', '585', '750', '875', '916', '999'];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COLOR_HEX = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  neutral: '#64748b',
};

function fmtRatio(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function GoldIndex({ formatMoney, toast }) {
  const mapRef = useRef(null);
  const mapInstRef = useRef(null);
  const layerRef = useRef(null);
  const [mapAddMode, setMapAddMode] = useState(false);
  const mapAddModeRef = useRef(false); // sync ref for Leaflet handler closure
  const addPinRef = useRef(null); // temporary marker while choosing location
  // For competitor map-click: { cityId, mode: 'new'|'edit' }
  const [compMapTarget, setCompMapTarget] = useState(null);
  const compMapTargetRef = useRef(null);
  /** После первого успешного ответа не включаем «полный» loading — иначе размонтируется карта и ломается Leaflet. */
  const hasLoadedOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [showCityForm, setShowCityForm] = useState(false);
  const [cityDraft, setCityDraft] = useState({
    region_code: '',
    region_name: '',
    city_name: '',
    street: '',
    building: '',
    address_note: '',
    geocode_raw: '',
    geocoded_label: '',
    lat: '',
    lng: '',
    population: '',
    notes: '',
  });
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  // GeoJSON layer
  const geoLayerRef = useRef(null);
  const geoJsonCacheRef = useRef(null);
  const [geoLoaded, setGeoLoaded] = useState(false);
  // Chart
  const [chartData, setChartData] = useState(null);
  const [chartProbe, setChartProbe] = useState('585');
  const [chartBusy, setChartBusy] = useState(false);
  const [editingCityId, setEditingCityId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [regionFilter, setRegionFilter] = useState('');
  const [showAddCompByCity, setShowAddCompByCity] = useState(() => new Set());
  const [cityQuery, setCityQuery] = useState('');
  const [pdfFrom, setPdfFrom] = useState('');
  const [pdfTo, setPdfTo] = useState('');
  const [historyByCity, setHistoryByCity] = useState({});
  const [historyBusyByCity, setHistoryBusyByCity] = useState({});
  const [editingCompetitorId, setEditingCompetitorId] = useState(null);
  const [editCompetitorDraft, setEditCompetitorDraft] = useState(null);
  const [compDraftByCity, setCompDraftByCity] = useState({});

  const load = useCallback(async () => {
    setErr('');
    if (!hasLoadedOnceRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await api.goldIndexOverview();
      setData(d);
      hasLoadedOnceRef.current = true;
      return d;
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить');
      setData(null);
      hasLoadedOnceRef.current = false;
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cities = data?.cities || [];
  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    return cities.filter((c) => {
      if (regionFilter && c.region_code !== regionFilter) return false;
      if (!q) return true;
      return `${c.city_name || ''} ${c.region_name || ''} ${c.street || ''} ${c.building || ''}`.toLowerCase().includes(q);
    });
  }, [cities, cityQuery, regionFilter]);
  const regionOptions = useMemo(() => {
    const map = new Map();
    for (const c of cities) {
      if (!map.has(c.region_code)) map.set(c.region_code, c.region_name || c.region_code);
    }
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [cities]);
  const regionsChart = useMemo(
    () =>
      (data?.regions || [])
        .filter((r) => r.ratioAvg != null && Number.isFinite(r.ratioAvg))
        .map((r) => ({
          name: r.regionName.length > 14 ? `${r.regionName.slice(0, 12)}…` : r.regionName,
          full: r.regionName,
          ratio: Number(r.ratioAvg.toFixed(3)),
        }))
        .slice(0, 24),
    [data?.regions]
  );

  // Area chart: flatten chart data into [{week, RU-SVE: 5800, ...}]
  // Deduplicate by regionName to avoid "Свердловская область" appearing twice
  const { flatLineData, lineRegions } = useMemo(() => {
    if (!chartData?.length) return { flatLineData: [], lineRegions: [] };
    const probeKey = `p${chartProbe}`;
    const weekSet = new Set();
    const byRegion = {};
    const seenNames = new Set();
    const sorted = [...chartData].sort((a, b) => b.points.length - a.points.length).slice(0, 8);
    for (const r of sorted) {
      // Deduplicate by name — merge into existing entry if name already seen
      const existingKey = [...Object.entries(byRegion)].find(([, v]) => v.name === r.regionName)?.[0];
      const key = existingKey || r.regionCode;
      if (!byRegion[key]) {
        if (seenNames.has(r.regionName)) continue;
        seenNames.add(r.regionName);
        byRegion[key] = { name: r.regionName, pts: {} };
      }
      for (const pt of r.points) {
        if (pt[probeKey] != null) {
          weekSet.add(pt.week);
          // Merge: average if already has value for this week
          const existing = byRegion[key].pts[pt.week];
          byRegion[key].pts[pt.week] = existing != null ? (existing + pt[probeKey]) / 2 : pt[probeKey];
        }
      }
    }
    const weeks = [...weekSet].sort();
    const flatLineData = weeks.map((w) => {
      const entry = { week: w };
      for (const [rc, { pts }] of Object.entries(byRegion)) {
        if (pts[w] != null) entry[rc] = Math.round(pts[w]);
      }
      return entry;
    });
    const lineRegions = Object.entries(byRegion).map(([rc, { name }]) => ({ regionCode: rc, regionName: name }));
    return { flatLineData, lineRegions };
  }, [chartData, chartProbe]);

  // Fetch Russia GeoJSON once on mount
  useEffect(() => {
    if (geoJsonCacheRef.current) return;
    fetch(GEO_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        geoJsonCacheRef.current = json;
        setGeoLoaded(true);
      })
      .catch((e) => console.warn('[GoldIndex] GeoJSON load failed:', e));
  }, []);

  // Update map: markers + region polygons
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstRef.current) {
      const m = L.map(mapRef.current, {
        scrollWheelZoom: true,
        tap: false,
        tapTolerance: 15,
        attributionControl: false,
        zoomControl: true,
      }).setView([61.5, 105], 3);
      // OSM-RU: корректно отображает Крым как российскую территорию
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.45, // приглушаем тайлы — регионы выделяются ярче
      }).addTo(m);
      geoLayerRef.current = L.layerGroup().addTo(m);  // polygons below
      layerRef.current = L.layerGroup().addTo(m);     // markers above
      mapInstRef.current = m;

      // Click-to-add: city or competitor coord selection
      m.on('click', (e) => {
        const isMapAdd = mapAddModeRef.current;
        const compTarget = compMapTargetRef.current;
        if (!isMapAdd && !compTarget) return;
        const { lat, lng } = e.latlng;
        if (addPinRef.current) { addPinRef.current.remove(); addPinRef.current = null; }
        const color = compTarget ? '#38bdf8' : '#e8c547';
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px ${color}66;animation:gi-pulse 1s infinite"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        addPinRef.current = L.marker([lat, lng], { icon }).addTo(m);
        if (compTarget) {
          window.dispatchEvent(new CustomEvent('gi:map-click-comp', { detail: { lat, lng, ...compTarget } }));
        } else {
          window.dispatchEvent(new CustomEvent('gi:map-click-add', { detail: { lat, lng } }));
        }
      });
    }

    // ── Region polygons ──────────────────────────────────────────────────────
    const geoLayer = geoLayerRef.current;
    geoLayer.clearLayers();
    if (geoJsonCacheRef.current && data?.regions?.length) {
      const regionList = data.regions;
      let activeGeoJson = null;
      activeGeoJson = L.geoJSON(geoJsonCacheRef.current, {
        style: (feature) => {
          const r = matchFeatureToRegion(feature.properties, regionList);
          // fillOpacity:0 = прозрачная заливка, но область ловит курсор по всей площади
          if (!r) return { fillColor: '#000', fillOpacity: 0, weight: 1.2, color: '#c8a84b', opacity: 0.65 };
          return {
            fillColor: COLOR_HEX[r.colorKey] || COLOR_HEX.neutral,
            fillOpacity: 0,
            weight: 2.5,
            color: COLOR_HEX[r.colorKey] || COLOR_HEX.neutral,
            opacity: 0.9,
          };
        },
        onEachFeature: (feature, fl) => {
          const r = matchFeatureToRegion(feature.properties, regionList);
          const rawName = feature.properties?.name_ru || feature.properties?.name || feature.properties?.hasc || '';
          if (r) {
            // Aggregate cityCount across all region records with the same name
            // (can happen when cities were added with different region_code variants)
            const normName = normRu(r.regionName || '');
            const allSameName = regionList.filter((rl) => normRu(rl.regionName || '') === normName);
            const cityCount = allSameName.reduce((s, rl) => s + (rl.cityCount || 0), 0);
            const ratio = fmtRatio(r.ratioAvg);
            const colorDot = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLOR_HEX[r.colorKey] || COLOR_HEX.neutral};margin-right:5px;vertical-align:middle"></span>`;
            fl.bindTooltip(
              `<div style="font-size:13px"><strong>${colorDot}${escapeHtml(r.regionName)}</strong></div>` +
              `<div style="font-size:11px;color:#888;margin-top:2px">Городов: ${cityCount} · Индекс: ${ratio}</div>`,
              { sticky: true, className: 'gi-map-tooltip' }
            );
            fl.on('click', () => { fl.openTooltip(); });
          } else {
            if (rawName) fl.bindTooltip(`<span style="font-size:12px">${escapeHtml(rawName)}</span>`, { sticky: true, className: 'gi-map-tooltip' });
          }
          fl.on('mouseover', function () {
            // При наведении — лёгкая заливка цветом региона
            this.setStyle({
              fillOpacity: r ? 0.12 : 0.06,
              weight: r ? 3.5 : 2,
              opacity: 1,
            });
          });
          fl.on('mouseout', function () { activeGeoJson.resetStyle(this); });
        },
      });
      activeGeoJson.addTo(geoLayer);
    }

    // ── City markers ─────────────────────────────────────────────────────────
    const layer = layerRef.current;
    const m = mapInstRef.current;
    layer.clearLayers();
    for (const c of filteredCities) {
      const fill = COLOR_HEX[c.colorKey] || COLOR_HEX.neutral;
      const textOnFill = (c.colorKey === 'green' || c.colorKey === 'yellow') ? '#1a0e00' : '#fff';
      const competitors = c.competitors || [];
      const compCount = competitors.length;

      // Top-3 competitors in popup
      const compRowsHtml = competitors.slice(0, 3).map((co) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0e6d0;">` +
        `<span style="font-size:12px;color:#3d2b0e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px">${escapeHtml(co.companyName || '—')}</span>` +
        `<span style="font-size:12px;font-weight:700;color:${COLOR_HEX[co.colorKey] || '#888'};margin-left:8px">${fmtRatio(co.ratioAvg)}</span>` +
        `</div>`
      ).join('');

      const popupHtml =
        `<div style="min-width:210px;max-width:260px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;border-radius:10px">` +
        // Header
        `<div style="background:${fill};padding:11px 14px;margin:-1px -1px 10px;border-radius:10px 10px 0 0">` +
        `<div style="font-weight:800;font-size:15px;color:${textOnFill};letter-spacing:0.01em">${escapeHtml(c.city_name)}</div>` +
        `<div style="font-size:11px;color:${textOnFill};opacity:0.8;margin-top:1px">${escapeHtml(c.region_name)}</div>` +
        `</div>` +
        // Stats row
        `<div style="display:flex;gap:14px;padding:0 14px 10px">` +
        `<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.06em">Индекс</div>` +
        `<div style="font-size:20px;font-weight:800;color:${fill};line-height:1.2">${fmtRatio(c.ratioAvg)}</div></div>` +
        `<div><div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.06em">Конкурентов</div>` +
        `<div style="font-size:20px;font-weight:800;color:#3d2b0e;line-height:1.2">${compCount}</div></div>` +
        `</div>` +
        // Competitors
        (compRowsHtml ? `<div style="padding:0 14px 8px;border-top:1px solid #f0e6d0;padding-top:8px">${compRowsHtml}</div>` : '') +
        (compCount > 3 ? `<div style="padding:0 14px 6px;font-size:11px;color:#b8860b">+ещё ${compCount - 3}</div>` : '') +
        // Button
        `<div style="padding:8px 14px 12px">` +
        `<button class="gi-popup-detail-btn" data-city-id="${c.id}" style="width:100%;padding:8px 12px;` +
        `background:linear-gradient(135deg,#b8860b,#e8c547);border:none;border-radius:8px;` +
        `font-weight:700;cursor:pointer;font-size:13px;color:#1a0e00;letter-spacing:0.02em;` +
        `transition:opacity 0.15s">Подробнее ↓</button>` +
        `</div>` +
        `</div>`;

      const mk = L.circleMarker([c.lat, c.lng], {
        radius: 11, color: '#fff', weight: 2.5, fillColor: fill, fillOpacity: 1,
      });

      mk.bindPopup(popupHtml, { maxWidth: 280, className: 'gi-city-popup' });

      // Wire up "Подробнее" button after popup opens
      const cityId = c.id;
      mk.on('popupopen', () => {
        const popupEl = mk.getPopup()?.getElement();
        const btn = popupEl?.querySelector('.gi-popup-detail-btn');
        if (btn) {
          btn.onmouseenter = () => { btn.style.opacity = '0.85'; };
          btn.onmouseleave = () => { btn.style.opacity = '1'; };
          btn.onclick = () => {
            mk.closePopup();
            setExpanded((prev) => new Set(prev).add(cityId));
            setTimeout(() => {
              document.getElementById(`gi-city-${cityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 120);
          };
        }
      });

      mk.addTo(layer);

      // ── Competitor markers (only those with own lat/lng) ─────────────────
      for (const co of competitors) {
        if (co.lat == null || co.lng == null) continue;
        const coFill = COLOR_HEX[co.colorKey] || COLOR_HEX.neutral;
        const coMk = L.circleMarker([co.lat, co.lng], {
          radius: 7, color: '#fff', weight: 2, fillColor: coFill, fillOpacity: 1,
          // Small inner dot to distinguish from city marker
        });
        const coPopupHtml =
          `<div style="min-width:170px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">` +
          `<div style="background:${coFill};padding:8px 12px;margin:-1px -1px 8px;border-radius:8px 8px 0 0">` +
          `<div style="font-weight:700;font-size:13px;color:${(co.colorKey === 'green' || co.colorKey === 'yellow') ? '#1a0e00' : '#fff'}">${escapeHtml(co.companyName)}</div>` +
          `<div style="font-size:11px;opacity:0.8;color:${(co.colorKey === 'green' || co.colorKey === 'yellow') ? '#1a0e00' : '#fff'}">${escapeHtml(c.city_name)} · ${escapeHtml(c.region_name)}</div>` +
          `</div>` +
          `<div style="padding:0 12px 8px;font-size:12px;color:#555">` +
          (co.notes ? `<div style="margin-bottom:4px">📍 ${escapeHtml(co.notes)}</div>` : '') +
          `<div>Индекс: <strong style="color:${coFill}">${fmtRatio(co.ratioAvg)}</strong></div>` +
          (co.measuredAt ? `<div style="color:#999;font-size:11px;margin-top:2px">Замер: ${co.measuredAt}</div>` : '') +
          `</div></div>`;
        coMk.bindPopup(coPopupHtml, { maxWidth: 240, className: 'gi-city-popup' });
        coMk.addTo(layer);
      }
    }
    if (filteredCities.length === 1) m.setView([filteredCities[0].lat, filteredCities[0].lng], 8);

    requestAnimationFrame(() => { try { mapInstRef.current?.invalidateSize(); } catch { /* ignore */ } });
  }, [filteredCities, geoLoaded, data?.regions]);

  // Sync modes into refs readable by Leaflet handlers
  useEffect(() => {
    mapAddModeRef.current = mapAddMode;
    compMapTargetRef.current = compMapTarget;
    const container = mapInstRef.current?.getContainer();
    if (container) container.style.cursor = (mapAddMode || compMapTarget) ? 'crosshair' : '';
  }, [mapAddMode, compMapTarget]);

  // Handle map click-to-add event
  useEffect(() => {
    async function onMapClickAdd(e) {
      const { lat, lng } = e.detail;
      setShowCityForm(true);
      setCityDraft((d) => ({ ...d, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      setMapAddMode(false);
      // Auto reverse-geocode
      try {
        const { default: axios } = await import('axios');
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`;
        // Note: browsers block User-Agent header — omit it, Nominatim works fine without it
        const { data: gd } = await axios.get(url, { timeout: 8000 });
        const addr = gd?.address || {};
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        const region = addr.state || '';
        const street = addr.road || '';
        const building = addr.house_number || '';
        setCityDraft((d) => ({
          ...d,
          city_name: d.city_name || city,
          region_name: d.region_name || region,
          street: d.street || street,
          building: d.building || building,
          geocoded_label: gd?.display_name || '',
        }));
      } catch { /* ignore reverse geocode errors */ }
      // Scroll to form
      setTimeout(() => {
        document.querySelector('.gold-index__form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
    window.addEventListener('gi:map-click-add', onMapClickAdd);

    function onMapClickComp(e) {
      const { lat, lng, cityId, mode } = e.detail;
      const latStr = lat.toFixed(6);
      const lngStr = lng.toFixed(6);
      if (mode === 'new') {
        setCompDraftByCity((prev) => ({
          ...prev,
          [cityId]: { ...(prev[cityId] || {}), lat: latStr, lng: lngStr },
        }));
      } else if (mode === 'edit') {
        setEditCompetitorDraft((d) => ({ ...(d || {}), lat: latStr, lng: lngStr }));
      }
      setCompMapTarget(null);
      if (addPinRef.current) { addPinRef.current.remove(); addPinRef.current = null; }
      // Scroll back to city card
      setTimeout(() => {
        document.getElementById(`gi-city-${cityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
    window.addEventListener('gi:map-click-comp', onMapClickComp);
    return () => {
      window.removeEventListener('gi:map-click-add', onMapClickAdd);
      window.removeEventListener('gi:map-click-comp', onMapClickComp);
    };
  }, []);

  useEffect(() => {
    return () => {
      mapInstRef.current?.remove();
      mapInstRef.current = null;
      geoLayerRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Load chart data whenever base data or date filters change
  useEffect(() => {
    if (!data) return;
    setChartBusy(true);
    api.goldIndexChartHistory({ from: pdfFrom || undefined, to: pdfTo || undefined })
      .then((res) => setChartData(res?.series || []))
      .catch(() => setChartData([]))
      .finally(() => setChartBusy(false));
  }, [data, pdfFrom, pdfTo]);

  async function handlePdf() {
    setPdfBusy(true);
    try {
      const blob = await api.goldIndexReportPdf({
        regionCode: regionFilter || undefined,
        from: pdfFrom || undefined,
        to: pdfTo || undefined,
      });
      downloadBlob(blob, `gold-index-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast('PDF сохранён', 'success');
    } catch (e) {
      toast(e?.message || 'Ошибка PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleExcel() {
    setExcelBusy(true);
    try {
      const blob = await api.goldIndexExportXlsx({
        regionCode: regionFilter || undefined,
        from: pdfFrom || undefined,
        to: pdfTo || undefined,
      });
      downloadBlob(blob, `gold-index-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast('Excel сохранен', 'success');
    } catch (e) {
      toast(e?.message || 'Ошибка Excel', 'error');
    } finally {
      setExcelBusy(false);
    }
  }

  async function loadCityHistory(cityId) {
    if (!cityId) return;
    setHistoryBusyByCity((prev) => ({ ...prev, [cityId]: true }));
    try {
      const out = await api.goldIndexHistory({
        cityId,
        from: pdfFrom || undefined,
        to: pdfTo || undefined,
        limit: 20,
      });
      setHistoryByCity((prev) => ({ ...prev, [cityId]: out?.rows || [] }));
    } catch (e) {
      toast(e?.message || 'Не удалось загрузить историю изменений', 'error');
    } finally {
      setHistoryBusyByCity((prev) => ({ ...prev, [cityId]: false }));
    }
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
        if (!historyByCity[id] && !historyBusyByCity[id]) {
          loadCityHistory(id);
        }
      }
      return n;
    });
  }

  useEffect(() => {
    for (const cityId of expanded) {
      if (!historyBusyByCity[cityId]) loadCityHistory(cityId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFrom, pdfTo]);

  function probeFieldsForCity(cityId) {
    const probes = data?.probesSuggested || [585, 750, 916];
    const draft = compDraftByCity[cityId] || { company_name: '', measured_at: '', probes: {} };
    return { probes, draft };
  }

  function setCompDraft(cityId, patch) {
    setCompDraftByCity((prev) => ({
      ...prev,
      [cityId]: { company_name: '', measured_at: '', probes: {}, ...(prev[cityId] || {}), ...patch },
    }));
  }

  // GPS self-location for competitor form
  const [geolocBusy, setGeolocBusy] = useState(null); // cityId | 'edit' | null
  function useMyLocation(target) {
    // target: { type: 'new', cityId } | { type: 'edit' }
    if (!navigator.geolocation) {
      toast('Геолокация не поддерживается браузером', 'error');
      return;
    }
    const key = target.type === 'edit' ? 'edit' : target.cityId;
    setGeolocBusy(key);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (target.type === 'new') {
          setCompDraft(target.cityId, { lat, lng });
          // Show on map
          if (mapInstRef.current) {
            mapInstRef.current.setView([parseFloat(lat), parseFloat(lng)], 16);
            if (addPinRef.current) { addPinRef.current.remove(); addPinRef.current = null; }
            const icon = L.divIcon({
              className: '',
              html: '<div style="width:16px;height:16px;background:#38bdf8;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(56,189,248,0.3)"></div>',
              iconSize: [16, 16], iconAnchor: [8, 8],
            });
            addPinRef.current = L.marker([parseFloat(lat), parseFloat(lng)], { icon }).addTo(mapInstRef.current);
          }
        } else {
          setEditCompetitorDraft((d) => ({ ...(d || {}), lat, lng }));
        }
        toast(`Геопозиция определена: ${lat}, ${lng}`, 'success');
        setGeolocBusy(null);
      },
      (err) => {
        const msgs = {
          1: 'Разрешите доступ к геолокации в настройках браузера',
          2: 'Не удалось определить местоположение (GPS недоступен)',
          3: 'Время ожидания истекло — попробуйте ещё раз',
        };
        toast(msgs[err.code] || 'Ошибка геолокации', 'error');
        setGeolocBusy(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function buildGeocodePayload(draft) {
    const raw = String(draft.geocode_raw || '').trim();
    if (raw) return { raw_query: raw };
    return {
      city_name: draft.city_name,
      region_name: draft.region_name,
      street: draft.street || '',
      building: draft.building || '',
      address_note: draft.address_note || '',
    };
  }

  async function runGeocodeNew() {
    setGeocodeBusy(true);
    try {
      const out = await api.goldIndexGeocode(buildGeocodePayload(cityDraft));
      setCityDraft((d) => ({
        ...d,
        lat: String(out.lat),
        lng: String(out.lng),
        geocoded_label: out.displayName || '',
      }));
      toast('Координаты подставлены — проверьте маркер на карте и при необходимости поправьте вручную', 'success');
    } catch (e2) {
      toast(e2?.message || 'Геокодирование не удалось', 'error');
    } finally {
      setGeocodeBusy(false);
    }
  }

  async function runGeocodeEdit() {
    if (!editDraft) return;
    setGeocodeBusy(true);
    try {
      const out = await api.goldIndexGeocode(buildGeocodePayload(editDraft));
      setEditDraft((d) => ({
        ...d,
        lat: String(out.lat),
        lng: String(out.lng),
        geocoded_label: out.displayName || '',
      }));
      toast('Координаты подставлены — проверьте маркер на карте и при необходимости поправьте вручную', 'success');
    } catch (e2) {
      toast(e2?.message || 'Геокодирование не удалось', 'error');
    } finally {
      setGeocodeBusy(false);
    }
  }

  function startEditCity(c) {
    setEditingCityId(c.id);
    setEditDraft({
      region_code: c.region_code ?? '',
      region_name: c.region_name ?? '',
      city_name: c.city_name ?? '',
      street: c.street ?? '',
      building: c.building ?? '',
      address_note: c.address_note ?? '',
      geocode_raw: '',
      geocoded_label: c.geocoded_label ?? '',
      lat: c.lat != null ? String(c.lat) : '',
      lng: c.lng != null ? String(c.lng) : '',
      population: c.population != null ? String(c.population) : '',
      notes: c.notes ?? '',
    });
  }

  function cancelEditCity() {
    setEditingCityId(null);
    setEditDraft(null);
  }

  async function saveEditCity() {
    if (!editingCityId || !editDraft) return;
    const lat = parseFloat(String(editDraft.lat).replace(',', '.'));
    const lng = parseFloat(String(editDraft.lng).replace(',', '.'));
    if (!editDraft.region_code?.trim() || !editDraft.region_name?.trim() || !editDraft.city_name?.trim()) {
      toast('Укажите код региона, регион и город', 'error');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast('Укажите корректные широту и долготу', 'error');
      return;
    }
    try {
      await api.goldIndexUpdateCity(editingCityId, {
        region_code: editDraft.region_code,
        region_name: editDraft.region_name,
        city_name: editDraft.city_name,
        lat,
        lng,
        population: editDraft.population === '' ? null : editDraft.population,
        notes: editDraft.notes || null,
        street: editDraft.street?.trim() ? editDraft.street.trim() : null,
        building: editDraft.building?.trim() ? editDraft.building.trim() : null,
        address_note: editDraft.address_note?.trim() ? editDraft.address_note.trim() : null,
        geocoded_label: editDraft.geocoded_label?.trim() ? editDraft.geocoded_label.trim() : null,
      });
      toast('Город обновлён', 'success');
      cancelEditCity();
      const fresh = await load();
      const persisted = (fresh?.cities || []).find((x) => x.id === editingCityId);
      if (persisted) {
        const before = [editDraft.street || '', editDraft.building || '', editDraft.address_note || '', editDraft.geocoded_label || '']
          .map((x) => x.trim())
          .join('|');
        const after = [persisted.street || '', persisted.building || '', persisted.address_note || '', persisted.geocoded_label || '']
          .map((x) => String(x).trim())
          .join('|');
        if (before !== after) {
          toast('Часть адресных полей не сохранилась. Проверьте миграции БД и перезапуск API.', 'error');
        }
      }
      await loadCityHistory(editingCityId);
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
    }
  }

  async function submitCity(e) {
    e.preventDefault();
    try {
      const { id: newCityId } = await api.goldIndexCreateCity({
        region_code: cityDraft.region_code,
        region_name: cityDraft.region_name,
        city_name: cityDraft.city_name,
        lat: parseFloat(String(cityDraft.lat).replace(',', '.')),
        lng: parseFloat(String(cityDraft.lng).replace(',', '.')),
        population: cityDraft.population === '' ? null : cityDraft.population,
        notes: cityDraft.notes || null,
        street: cityDraft.street?.trim() ? cityDraft.street.trim() : null,
        building: cityDraft.building?.trim() ? cityDraft.building.trim() : null,
        address_note: cityDraft.address_note?.trim() ? cityDraft.address_note.trim() : null,
        geocoded_label: cityDraft.geocoded_label?.trim() ? cityDraft.geocoded_label.trim() : null,
      });
      toast('Город добавлен — теперь добавьте первого конкурента', 'success');
      setShowCityForm(false);
      setCityDraft({
        region_code: '', region_name: '', city_name: '', street: '', building: '',
        address_note: '', geocode_raw: '', geocoded_label: '', lat: '', lng: '', population: '', notes: '',
      });
      const freshData = await load();
      // Auto-expand the new city card and open competitor form
      if (newCityId) {
        setExpanded((prev) => { const n = new Set(prev); n.add(newCityId); return n; });
        setShowAddCompByCity((prev) => { const n = new Set(prev); n.add(newCityId); return n; });
        setTimeout(() => {
          document.getElementById(`gi-city-${newCityId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
    }
  }

  async function submitCompetitor(cityId) {
    const d = compDraftByCity[cityId] || {};
    try {
      await api.goldIndexCreateCompetitor(cityId, {
        company_name: d.company_name,
        probes: d.probes || {},
        measured_at: d.measured_at || null,
        notes: d.notes || null,
        lat: d.lat || null,
        lng: d.lng || null,
      });
      toast('Конкурент добавлен', 'success');
      setCompDraft(cityId, { company_name: '', measured_at: '', probes: {}, notes: '', lat: '', lng: '' });
      await load();
      await loadCityHistory(cityId);
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
    }
  }

  function startEditCompetitor(co) {
    setEditingCompetitorId(co.id);
    setEditCompetitorDraft({
      company_name: co.companyName || '',
      measured_at: co.measuredAt || '',
      notes: co.notes || '',
      lat: co.lat != null ? String(co.lat) : '',
      lng: co.lng != null ? String(co.lng) : '',
      probes: { ...(co.probes || {}) },
    });
  }

  function cancelEditCompetitor() {
    setEditingCompetitorId(null);
    setEditCompetitorDraft(null);
  }

  async function saveCompetitor(cityId, competitorId) {
    if (!editCompetitorDraft) return;
    try {
      await api.goldIndexUpdateCompetitor(competitorId, {
        company_name: editCompetitorDraft.company_name,
        measured_at: editCompetitorDraft.measured_at || null,
        notes: editCompetitorDraft.notes || null,
        probes: editCompetitorDraft.probes || {},
        lat: editCompetitorDraft.lat || null,
        lng: editCompetitorDraft.lng || null,
      });
      toast('Конкурент обновлён', 'success');
      cancelEditCompetitor();
      await load();
      await loadCityHistory(cityId);
    } catch (e) {
      toast(e?.message || 'Ошибка', 'error');
    }
  }

  async function deleteCity(id) {
    if (!window.confirm('Удалить город и всех конкурентов?')) return;
    try {
      await api.goldIndexDeleteCity(id);
      toast('Удалено', 'success');
      await load();
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
    }
  }

  async function deleteCompetitor(cityId, id) {
    if (!window.confirm('Удалить компанию из списка?')) return;
    try {
      await api.goldIndexDeleteCompetitor(id);
      toast('Удалено', 'success');
      await load();
      await loadCityHistory(cityId);
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
    }
  }

  return (
    <section className="gold-index glass">
      <div className="gold-index__head">
        <div>
          <h2 className="gold-index__title">Индекс золота</h2>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 560, lineHeight: 1.45 }}>
            Рыночные цены конкурентов по пробам сравниваются с эталоном выкупа из текущего курса и настроек. Индекс ≈ 1.0 — как
            «линия» калькулятора; выше — дороже рынок относительно эталона.
          </p>
        </div>
        <div className="gold-index__actions">
          <button type="button" className="btn-ghost gi-btn-refresh" disabled={pdfBusy || loading || refreshing} onClick={() => load()}>
            ↻ Обновить
          </button>
          <div className="gi-export-block">
            <span className="gi-export-label">Период отчёта</span>
            <div className="gi-export-dates">
              <label className="gi-date-field">
                <span>с</span>
                <input type="date" className="input" value={pdfFrom} onChange={(e) => setPdfFrom(e.target.value)} />
              </label>
              <label className="gi-date-field">
                <span>по</span>
                <input type="date" className="input" value={pdfTo} onChange={(e) => setPdfTo(e.target.value)} />
              </label>
            </div>
            <div className="gi-export-btns">
              <button type="button" className="btn-ghost" disabled={excelBusy || loading || refreshing} onClick={handleExcel}>
                {excelBusy ? '…' : '↓ Excel'}
              </button>
              <button type="button" className="btn-primary" disabled={pdfBusy || loading || refreshing} onClick={handlePdf}>
                {pdfBusy ? '…' : '↓ PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && data == null && <p className="muted">Загрузка…</p>}
      {refreshing && data && (
        <p className="muted small" style={{ marginBottom: 8 }}>
          Обновление…
        </p>
      )}
      {err && <p className="err-text">{err}</p>}

      {data && (
        <>
          <div className="gi-stats-grid">
            <div className="gi-stat-card">
              <div className="gi-stat-icon">⚡</div>
              <div>
                <div className="gi-stat-label">Биржа (эталон)</div>
                <div className="gi-stat-value mono-nums">
                  {data.goldRubPerGram != null ? formatMoney(data.goldRubPerGram) : '—'} <span className="gi-stat-unit">₽/г</span>
                </div>
              </div>
            </div>
            <div className="gi-stat-card">
              <div className="gi-stat-icon">🏷️</div>
              <div>
                <div className="gi-stat-label">Выкуп лома</div>
                <div className="gi-stat-value">{data.settingsSnapshot?.buybackPercentOfScrap ?? '—'}<span className="gi-stat-unit">%</span></div>
              </div>
            </div>
            <div className="gi-stat-card">
              <div className="gi-stat-icon">📍</div>
              <div>
                <div className="gi-stat-label">Городов</div>
                <div className="gi-stat-value">{data.stats?.cityCount ?? 0}</div>
              </div>
            </div>
            <div className="gi-stat-card">
              <div className="gi-stat-icon">👥</div>
              <div>
                <div className="gi-stat-label">Охват населения</div>
                <div className="gi-stat-value mono-nums">
                  {data.stats?.populationCovered != null
                    ? new Intl.NumberFormat('ru-RU').format(data.stats.populationCovered)
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="gold-index__legend">
            <span className="gi-legend-title">Индекс:</span>
            {[
              ['green', 'ниже рынка'],
              ['yellow', 'умеренно'],
              ['orange', 'выше'],
              ['red', 'значительно выше'],
            ].map(([k, label]) => (
              <span key={k} className="gold-index__leg-item">
                <i style={{ background: COLOR_HEX[k] }} /> {label}
              </span>
            ))}
          </div>

          <div className="gold-index__map-wrap">
            <div ref={mapRef} className="gold-index__map" />
            <button
              type="button"
              className={`gi-map-add-btn${mapAddMode ? ' gi-map-add-btn--active' : ''}`}
              onClick={() => {
                setMapAddMode((v) => !v);
                if (!mapAddMode) setShowCityForm(true);
              }}
              title={mapAddMode ? 'Отменить выбор' : 'Выбрать место на карте'}
            >
              {mapAddMode ? '✕ Отмена' : '📍 Тыкнуть на карту'}
            </button>
            {mapAddMode && (
              <div className="gi-map-add-hint">
                Нажмите на любое место карты — координаты города подставятся в форму
              </div>
            )}
            {compMapTarget && (
              <div className="gi-map-add-hint" style={{ background: 'rgba(14,80,110,0.88)' }}>
                Нажмите на место конкурента на карте
                <button
                  type="button"
                  onClick={() => setCompMapTarget(null)}
                  style={{ marginLeft: 10, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              </div>
            )}
          </div>

          {regionsChart.length > 0 && (
            <div className="gold-index__chart">
              <div className="gi-chart-header">
                <span className="gi-chart-title">Индекс по регионам</span>
                <span className="gi-chart-subtitle muted small">{regionsChart.length} регион{regionsChart.length === 1 ? '' : regionsChart.length < 5 ? 'а' : 'ов'}</span>
              </div>
              <div style={{ width: '100%', height: 210 }}>
                <ResponsiveContainer>
                  <BarChart data={regionsChart} margin={{ top: 8, right: 8, left: 0, bottom: 40 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e6d0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7a6540' }} interval={0} angle={-30} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 10, fill: '#7a6540' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                    <Tooltip
                      cursor={{ fill: 'rgba(232,197,71,0.08)' }}
                      formatter={(v, _, { payload }) => [fmtRatio(v), payload?.full || '']}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e8c547', fontSize: 12 }}
                      labelFormatter={() => 'Индекс'}
                    />
                    <Bar dataKey="ratio" radius={[6, 6, 0, 0]}>
                      {regionsChart.map((r, i) => {
                        const colorKey = r.ratio < 1.5 ? 'green' : r.ratio < 2.5 ? 'yellow' : r.ratio < 3.5 ? 'orange' : 'red';
                        return <Cell key={i} fill={COLOR_HEX[colorKey]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Динамика цен по пробам ─────────────────────────────────────── */}
          <div className="gold-index__chart gi-price-chart">
            <div className="gi-chart-header">
              <div className="gi-chart-title-row">
                <span className="gi-chart-title">Динамика цены по пробам</span>
                <span className="gi-chart-subtitle muted small">
                  {chartBusy ? 'Загрузка…' : flatLineData.length > 1
                    ? `${flatLineData.length} недель данных · ${lineRegions.length} регион${lineRegions.length === 1 ? '' : lineRegions.length < 5 ? 'а' : 'ов'}`
                    : flatLineData.length === 1 ? 'Снимок за одну неделю' : 'Данные появятся после первого заполнения'}
                </span>
              </div>
              <div className="gi-probe-select">
                <span className="muted small">Проба:</span>
                <select
                  className="input"
                  value={chartProbe}
                  style={{ width: 72, padding: '4px 6px', fontSize: '0.85rem' }}
                  onChange={(e) => setChartProbe(e.target.value)}
                >
                  {COMMON_PROBES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {chartBusy && (
              <div className="gi-chart-empty">
                <span className="gi-chart-empty-icon">⏳</span>
                <span>Загружаем данные…</span>
              </div>
            )}

            {/* Single week — show bar snapshot, much clearer than 1 isolated dot */}
            {!chartBusy && flatLineData.length === 1 && lineRegions.length > 0 && (() => {
              const snapshot = lineRegions
                .map((r) => ({ name: r.regionName.length > 18 ? r.regionName.slice(0, 16) + '…' : r.regionName, full: r.regionName, value: flatLineData[0][r.regionCode] }))
                .filter((x) => x.value != null)
                .sort((a, b) => b.value - a.value);
              if (!snapshot.length) return null;
              return (
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={snapshot} margin={{ top: 8, right: 12, left: 0, bottom: 36 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e6d0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7a6540' }} interval={0} angle={-25} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 10, fill: '#7a6540' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(232,197,71,0.08)' }}
                        formatter={(v, _, { payload }) => [`${new Intl.NumberFormat('ru-RU').format(v)} ₽/г`, payload?.full || '']}
                        labelFormatter={() => `Проба ${chartProbe}`}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e8c547', fontSize: 12 }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {snapshot.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Multi-week — AreaChart with gradient fills */}
            {!chartBusy && flatLineData.length > 1 && (
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <AreaChart data={flatLineData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      {lineRegions.map((r, i) => (
                        <linearGradient key={r.regionCode} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e6d0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#7a6540' }} tickFormatter={(w) => w?.slice(5)} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#7a6540' }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid #e8c547', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
                      formatter={(v, name) => {
                        const r = lineRegions.find((r) => r.regionCode === name);
                        return [`${new Intl.NumberFormat('ru-RU').format(v)} ₽/г`, r?.regionName || name];
                      }}
                      labelFormatter={(w) => `Неделя ${w}`}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) => {
                        const r = lineRegions.find((r) => r.regionCode === value);
                        const n = r?.regionName || value;
                        return n.length > 22 ? n.slice(0, 20) + '…' : n;
                      }}
                    />
                    {lineRegions.map((r, i) => (
                      <Area
                        key={r.regionCode}
                        type="monotone"
                        dataKey={r.regionCode}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2.5}
                        fill={`url(#grad-${i})`}
                        dot={{ r: 4, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {!chartBusy && flatLineData.length === 0 && (
              <div className="gi-chart-empty">
                <span className="gi-chart-empty-icon">📈</span>
                <span>Добавьте конкурентов с ценами — динамика появится через несколько недель</span>
              </div>
            )}
          </div>

          <div className="gold-index__toolbar">
            <button type="button" className={`gi-add-city-btn${showCityForm ? ' gi-add-city-btn--active' : ''}`} onClick={() => setShowCityForm((v) => !v)}>
              <span className="gi-add-city-icon">{showCityForm ? '✕' : '+'}</span>
              {showCityForm ? 'Скрыть форму' : 'Добавить город'}
            </button>
            <div className="gi-filters">
              <select className="input" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                <option value="">Все регионы</option>
                {regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
              <input
                className="input"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="🔍 Поиск города, улицы…"
              />
            </div>
          </div>

          {showCityForm && (
            <form className="gold-index__form" onSubmit={submitCity}>
              <div className="gi-form-hint">
                <span className="gi-form-hint-icon">📍</span>
                <span>
                  Введите регион и название города. Нажмите <strong>«Подставить координаты»</strong> — 
                  система найдёт точку на карте автоматически. Или укажите координаты вручную 
                  (<a href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">OpenStreetMap</a> → ПКМ по точке).
                </span>
              </div>
              <div className="gold-index__grid">
                <label className="field">
                  <span className="field-label">Код региона</span>
                  <input
                    className="input"
                    value={cityDraft.region_code}
                    onChange={(e) => setCityDraft((d) => ({ ...d, region_code: e.target.value }))}
                    placeholder="например RU-KGD"
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Регион</span>
                  <input
                    className="input"
                    value={cityDraft.region_name}
                    onChange={(e) => setCityDraft((d) => ({ ...d, region_name: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Город</span>
                  <input
                    className="input"
                    value={cityDraft.city_name}
                    onChange={(e) => setCityDraft((d) => ({ ...d, city_name: e.target.value }))}
                    required
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="field-label">Адрес одной строкой для поиска</span>
                  <input
                    className="input"
                    value={cityDraft.geocode_raw}
                    onChange={(e) => setCityDraft((d) => ({ ...d, geocode_raw: e.target.value }))}
                    placeholder="Если заполнено — ищем только по этой строке (регион и город можно не повторять)"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Улица</span>
                  <input
                    className="input"
                    value={cityDraft.street}
                    onChange={(e) => setCityDraft((d) => ({ ...d, street: e.target.value }))}
                    placeholder="ул. …"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Дом / корп.</span>
                  <input
                    className="input"
                    value={cityDraft.building}
                    onChange={(e) => setCityDraft((d) => ({ ...d, building: e.target.value }))}
                  />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="field-label">Уточнение адреса</span>
                  <input
                    className="input"
                    value={cityDraft.address_note}
                    onChange={(e) => setCityDraft((d) => ({ ...d, address_note: e.target.value }))}
                    placeholder="Здание ТЦ, ориентир — попадает в запрос к геокодеру"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Широта</span>
                  <input
                    className="input mono-nums"
                    value={cityDraft.lat}
                    onChange={(e) => setCityDraft((d) => ({ ...d, lat: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Долгота</span>
                  <input
                    className="input mono-nums"
                    value={cityDraft.lng}
                    onChange={(e) => setCityDraft((d) => ({ ...d, lng: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">Население (руч.)</span>
                  <input
                    className="input mono-nums"
                    value={cityDraft.population}
                    onChange={(e) => setCityDraft((d) => ({ ...d, population: e.target.value }))}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={geocodeBusy || loading || refreshing}
                  onClick={(e) => {
                    e.preventDefault();
                    runGeocodeNew();
                  }}
                >
                  {geocodeBusy ? 'Поиск…' : 'Подставить координаты по адресу'}
                </button>
              </div>
              <label className="field">
                <span className="field-label">Подпись точки (геокодер / можно править)</span>
                <input
                  className="input"
                  value={cityDraft.geocoded_label}
                  onChange={(e) => setCityDraft((d) => ({ ...d, geocoded_label: e.target.value }))}
                  placeholder="Полный адрес от сервиса или своя пометка"
                />
              </label>
              <label className="field">
                <span className="field-label">Заметки</span>
                <input
                  className="input"
                  value={cityDraft.notes}
                  onChange={(e) => setCityDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <button type="submit" className="btn-primary">
                Сохранить город
              </button>
            </form>
          )}

          <div className="gold-index__cities">
            {filteredCities.map((c, idx) => (
              <div key={c.id} id={`gi-city-${c.id}`} className="gold-index__city" style={{ animationDelay: `${Math.min(idx * 40, 300)}ms` }}>
                <button type="button" className="gold-index__city-head" onClick={() => toggleExpand(c.id)}>
                  <span
                    className="gold-index__dot"
                    style={{ background: COLOR_HEX[c.colorKey] || COLOR_HEX.neutral }}
                  />
                  <span className="gold-index__city-title">
                    <strong>{c.city_name}</strong>
                    <span className="muted small"> · {c.region_name}</span>
                  </span>
                  <span className="mono-nums gold-index__ratio">{fmtRatio(c.ratioAvg)}</span>
                  <span className="muted small">{expanded.has(c.id) ? '▼' : '▶'}</span>
                </button>
                {expanded.has(c.id) && (
                  <div className="gold-index__city-body">
                    {editingCityId === c.id && editDraft ? (
                      <div style={{ marginBottom: 12 }}>
                        <p className="muted small" style={{ marginBottom: 8 }}>
                          Правка адреса и координат
                        </p>
                        <div className="gold-index__grid">
                          <label className="field">
                            <span className="field-label">Код региона</span>
                            <input
                              className="input"
                              value={editDraft.region_code}
                              onChange={(e) => setEditDraft((d) => ({ ...d, region_code: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Регион</span>
                            <input
                              className="input"
                              value={editDraft.region_name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, region_name: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Город</span>
                            <input
                              className="input"
                              value={editDraft.city_name}
                              onChange={(e) => setEditDraft((d) => ({ ...d, city_name: e.target.value }))}
                            />
                          </label>
                          <label className="field" style={{ gridColumn: '1 / -1' }}>
                            <span className="field-label">Адрес одной строкой для поиска</span>
                            <input
                              className="input"
                              value={editDraft.geocode_raw}
                              onChange={(e) => setEditDraft((d) => ({ ...d, geocode_raw: e.target.value }))}
                              placeholder="Необязательно: полный запрос к геокодеру"
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Улица</span>
                            <input
                              className="input"
                              value={editDraft.street}
                              onChange={(e) => setEditDraft((d) => ({ ...d, street: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Дом / корп.</span>
                            <input
                              className="input"
                              value={editDraft.building}
                              onChange={(e) => setEditDraft((d) => ({ ...d, building: e.target.value }))}
                            />
                          </label>
                          <label className="field" style={{ gridColumn: '1 / -1' }}>
                            <span className="field-label">Уточнение адреса</span>
                            <input
                              className="input"
                              value={editDraft.address_note}
                              onChange={(e) => setEditDraft((d) => ({ ...d, address_note: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Широта</span>
                            <input
                              className="input mono-nums"
                              value={editDraft.lat}
                              onChange={(e) => setEditDraft((d) => ({ ...d, lat: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Долгота</span>
                            <input
                              className="input mono-nums"
                              value={editDraft.lng}
                              onChange={(e) => setEditDraft((d) => ({ ...d, lng: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Население</span>
                            <input
                              className="input mono-nums"
                              value={editDraft.population}
                              onChange={(e) => setEditDraft((d) => ({ ...d, population: e.target.value }))}
                            />
                          </label>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '10px 0' }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={geocodeBusy || loading || refreshing}
                            onClick={runGeocodeEdit}
                          >
                            {geocodeBusy ? 'Поиск…' : 'Подставить координаты по адресу'}
                          </button>
                        </div>
                        <label className="field">
                          <span className="field-label">Подпись точки</span>
                          <input
                            className="input"
                            value={editDraft.geocoded_label}
                            onChange={(e) => setEditDraft((d) => ({ ...d, geocoded_label: e.target.value }))}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Заметки</span>
                          <input
                            className="input"
                            value={editDraft.notes}
                            onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                          />
                        </label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                          <button type="button" className="btn-primary" onClick={saveEditCity}>
                            Сохранить
                          </button>
                          <button type="button" className="btn-ghost" onClick={cancelEditCity}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="gi-city-meta">
                          <span className="muted small">
                            {c.lat?.toFixed?.(4)}, {c.lng?.toFixed?.(4)}
                            {c.population != null ? ` · ${new Intl.NumberFormat('ru-RU').format(c.population)} чел.` : ''}
                          </span>
                          {formatCityAddressLine(c) && (
                            <span className="muted small"> · {formatCityAddressLine(c)}</span>
                          )}
                          <button
                            type="button"
                            className="btn-ghost small gi-edit-addr-btn"
                            onClick={() => startEditCity(c)}
                          >
                            Изменить
                          </button>
                        </div>
                      </>
                    )}

                    <div className="gi-comp-section-head">
                      <span className="gi-section-label">Конкуренты</span>
                      {(c.competitors || []).length > 0 && (
                        <span className="gi-comp-count">{(c.competitors || []).length}</span>
                      )}
                    </div>

                    {(c.competitors || []).length === 0 ? (
                      <p className="muted small gi-no-comp">Конкурентов пока нет — добавьте ниже.</p>
                    ) : (
                      <div className="gi-comp-list">
                        {(c.competitors || []).map((co) => (
                          <div key={co.id} className={`gi-comp-card${editingCompetitorId === co.id ? ' gi-comp-card--editing' : ''}`}>
                            <div className="gi-comp-card-bar" style={{ background: COLOR_HEX[co.colorKey] || COLOR_HEX.neutral }} />
                            <div className="gi-comp-card-body">
                            {editingCompetitorId === co.id ? (
                              <>
                                <div className="gi-comp-edit-row">
                                  <label className="field" style={{ flex: 2 }}>
                                    <span className="field-label">Компания</span>
                                    <input className="input" value={editCompetitorDraft?.company_name || ''}
                                      onChange={(e) => setEditCompetitorDraft((d) => ({ ...(d || {}), company_name: e.target.value }))} />
                                  </label>
                                  <label className="field">
                                    <span className="field-label">Дата замера</span>
                                    <input className="input" type="date" value={editCompetitorDraft?.measured_at || ''}
                                      onChange={(e) => setEditCompetitorDraft((d) => ({ ...(d || {}), measured_at: e.target.value }))} />
                                  </label>
                                </div>
                                <label className="field">
                                  <span className="field-label">Адрес точки</span>
                                  <input className="input" placeholder="ул. Ленина, 12"
                                    value={editCompetitorDraft?.notes || ''}
                                    onChange={(e) => setEditCompetitorDraft((d) => ({ ...(d || {}), notes: e.target.value }))} />
                                </label>
                                <div className="gi-comp-coords-row">
                                  <label className="field" style={{ flex: 1 }}>
                                    <span className="field-label">Широта</span>
                                    <input className="input mono-nums" placeholder="56.8174" inputMode="decimal"
                                      value={editCompetitorDraft?.lat || ''}
                                      onChange={(e) => setEditCompetitorDraft((d) => ({ ...(d || {}), lat: e.target.value }))} />
                                  </label>
                                  <label className="field" style={{ flex: 1 }}>
                                    <span className="field-label">Долгота</span>
                                    <input className="input mono-nums" placeholder="60.6037" inputMode="decimal"
                                      value={editCompetitorDraft?.lng || ''}
                                      onChange={(e) => setEditCompetitorDraft((d) => ({ ...(d || {}), lng: e.target.value }))} />
                                  </label>
                                  <div className="gi-comp-loc-btns">
                                    <button
                                      type="button"
                                      className="gi-comp-map-pin-btn gi-gps-btn"
                                      title="Определить моё местоположение"
                                      disabled={geolocBusy === 'edit'}
                                      onClick={() => useMyLocation({ type: 'edit' })}
                                    >
                                      {geolocBusy === 'edit' ? '⏳' : '🎯'}
                                    </button>
                                    <button
                                      type="button"
                                      className={`gi-comp-map-pin-btn${compMapTarget?.cityId === c.id && compMapTarget?.mode === 'edit' ? ' gi-comp-map-pin-btn--active' : ''}`}
                                      title="Выбрать на карте"
                                      onClick={() => {
                                        setCompMapTarget((prev) =>
                                          prev?.cityId === c.id && prev?.mode === 'edit' ? null : { cityId: c.id, mode: 'edit' }
                                        );
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                      }}
                                    >
                                      {compMapTarget?.cityId === c.id && compMapTarget?.mode === 'edit' ? '✕' : '🗺️'}
                                    </button>
                                  </div>
                                </div>
                                <div className="gold-index__probe-grid" style={{ marginTop: 8 }}>
                                  {probeFieldsForCity(c.id).probes.map((pb) => (
                                    <label key={pb} className="field">
                                      <span className="field-label">{pb} ₽/г</span>
                                      <input className="input mono-nums" inputMode="decimal" placeholder="0"
                                        value={editCompetitorDraft?.probes?.[pb] ?? ''}
                                        onChange={(e) => setEditCompetitorDraft((d) => ({
                                          ...(d || {}), probes: { ...(d?.probes || {}), [pb]: e.target.value },
                                        }))} />
                                    </label>
                                  ))}
                                </div>
                                <div className="gi-comp-actions">
                                  <button type="button" className="btn-primary" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={() => saveCompetitor(c.id, co.id)}>Сохранить</button>
                                  <button type="button" className="btn-ghost small" onClick={cancelEditCompetitor}>Отмена</button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="gi-comp-header">
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span className="gi-comp-name">{co.companyName}</span>
                                    {co.measuredAt && <span className="gi-comp-date muted small"> · {co.measuredAt}</span>}
                                    {co.notes && <div className="gi-comp-address muted small">📍 {co.notes}</div>}
                                  </div>
                                  <span className={`gi-comp-ratio gi-ratio--${co.colorKey || 'neutral'}`}>{fmtRatio(co.ratioAvg)}</span>
                                </div>
                                {Object.keys(co.probes || {}).length > 0 && (
                                  <div className="gi-probe-chips">
                                    {Object.entries(co.probes || {}).map(([k, v]) => (
                                      <span key={k} className="gi-probe-chip">
                                        <span className="gi-probe-label">{k}</span>
                                        <span className="gi-probe-val">{formatMoney(typeof v === 'number' ? v : Number(v))}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="gi-comp-actions">
                                  <button type="button" className="btn-ghost small" onClick={() => startEditCompetitor(co)}>✎ Изменить</button>
                                  <button type="button" className="btn-ghost small danger" onClick={() => deleteCompetitor(c.id, co.id)}>Удалить</button>
                                </div>
                              </>
                            )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="gi-add-comp-toggle-row">
                      <button
                        type="button"
                        className={`gi-add-comp-toggle${showAddCompByCity.has(c.id) ? ' gi-add-comp-toggle--open' : ''}`}
                        onClick={() => setShowAddCompByCity((prev) => {
                          const n = new Set(prev);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          return n;
                        })}
                      >
                        <span>{showAddCompByCity.has(c.id) ? '✕' : '+'}</span>
                        {showAddCompByCity.has(c.id) ? 'Скрыть форму' : 'Добавить конкурента'}
                      </button>
                    </div>
                    {showAddCompByCity.has(c.id) && (
                      <div className="gi-new-comp">
                        <div className="gi-comp-edit-row">
                          <label className="field" style={{ flex: 2 }}>
                            <span className="field-label">Название компании</span>
                            <input className="input" placeholder="Ломбард / Скупка / …" value={compDraftByCity[c.id]?.company_name || ''}
                              onChange={(e) => setCompDraft(c.id, { company_name: e.target.value })} />
                          </label>
                          <label className="field">
                            <span className="field-label">Дата замера</span>
                            <input className="input" type="date" value={compDraftByCity[c.id]?.measured_at || new Date().toISOString().slice(0, 10)}
                              onChange={(e) => setCompDraft(c.id, { measured_at: e.target.value })} />
                          </label>
                        </div>
                        <div className="gi-comp-edit-row">
                          <label className="field" style={{ flex: 1 }}>
                            <span className="field-label">Адрес точки</span>
                            <input className="input" placeholder="ул. Ленина, 12"
                              value={compDraftByCity[c.id]?.notes || ''}
                              onChange={(e) => setCompDraft(c.id, { notes: e.target.value })} />
                          </label>
                        </div>
                        <div className="gi-comp-coords-row">
                          <label className="field" style={{ flex: 1 }}>
                            <span className="field-label">Широта</span>
                            <input className="input mono-nums" placeholder="56.8174" inputMode="decimal"
                              value={compDraftByCity[c.id]?.lat || ''}
                              onChange={(e) => setCompDraft(c.id, { lat: e.target.value })} />
                          </label>
                          <label className="field" style={{ flex: 1 }}>
                            <span className="field-label">Долгота</span>
                            <input className="input mono-nums" placeholder="60.6037" inputMode="decimal"
                              value={compDraftByCity[c.id]?.lng || ''}
                              onChange={(e) => setCompDraft(c.id, { lng: e.target.value })} />
                          </label>
                          <div className="gi-comp-loc-btns">
                            <button
                              type="button"
                              className="gi-comp-map-pin-btn gi-gps-btn"
                              title="Определить моё местоположение"
                              disabled={geolocBusy === c.id}
                              onClick={() => useMyLocation({ type: 'new', cityId: c.id })}
                            >
                              {geolocBusy === c.id ? '⏳' : '🎯'}
                            </button>
                            <button
                              type="button"
                              className={`gi-comp-map-pin-btn${compMapTarget?.cityId === c.id && compMapTarget?.mode === 'new' ? ' gi-comp-map-pin-btn--active' : ''}`}
                              title="Выбрать на карте"
                              onClick={() => {
                                setCompMapTarget((prev) =>
                                  prev?.cityId === c.id && prev?.mode === 'new' ? null : { cityId: c.id, mode: 'new' }
                                );
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              {compMapTarget?.cityId === c.id && compMapTarget?.mode === 'new' ? '✕' : '🗺️'}
                            </button>
                          </div>
                        </div>
                        <div className="gold-index__probe-grid">
                          {probeFieldsForCity(c.id).probes.map((pb) => (
                            <label key={pb} className="field">
                              <span className="field-label">{pb} ₽/г</span>
                              <input className="input mono-nums" inputMode="decimal" placeholder="0"
                                value={compDraftByCity[c.id]?.probes?.[pb] ?? ''}
                                onChange={(e) => setCompDraft(c.id, { probes: { ...(compDraftByCity[c.id]?.probes || {}), [pb]: e.target.value } })} />
                            </label>
                          ))}
                        </div>
                        <button type="button" className="btn-primary" style={{ marginTop: 8 }} onClick={async () => {
                          await submitCompetitor(c.id);
                          setShowAddCompByCity((prev) => { const n = new Set(prev); n.delete(c.id); return n; });
                        }}>
                          Сохранить конкурента
                        </button>
                      </div>
                    )}
                    <details className="gi-history-details">
                      <summary className="gi-history-summary" style={{ cursor: 'pointer', userSelect: 'none' }}>
                        <span className="gi-section-title">История изменений</span>
                        <span className="muted small" style={{ marginLeft: 8 }}>
                          {historyBusyByCity[c.id] ? '…' : `${(historyByCity[c.id] || []).length} записей`}
                        </span>
                      </summary>
                      <div style={{ marginTop: 8 }}>
                        {historyBusyByCity[c.id] ? (
                          <p className="muted small">Загрузка…</p>
                        ) : (historyByCity[c.id] || []).length === 0 ? (
                          <p className="muted small">Изменений пока нет.</p>
                        ) : (
                          <div className="gi-history-list">
                            {(historyByCity[c.id] || []).map((h) => (
                              <div key={h.id} className="gi-history-row">
                                <span className={`gi-history-badge gi-history-badge--${h.action || 'update'}`}>
                                  {historyActionLabel(h.action)}
                                </span>
                                <span className="gi-history-entity muted small">
                                  {h.entity_type === 'city' ? 'Город' : 'Конкурент'}
                                </span>
                                <span className="gi-history-who">
                                  {[(h.changed_by_name || '').trim(), (h.changed_by_email || '').trim()].filter(Boolean).join(' · ') || 'Система'}
                                </span>
                                <span className="gi-history-when muted small">{formatHistoryDate(h.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>

                    <div className="gi-city-danger-zone">
                      <button type="button" className="btn-ghost small danger" onClick={() => deleteCity(c.id)}>
                        Удалить город
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        /* ── layout ────────────────────────────────────── */
        .gold-index { padding: clamp(12px,3vw,24px) clamp(12px,3vw,24px) 28px; border-radius: 16px; margin-bottom: 16px; }

        /* ── header ────────────────────────────────────── */
        .gold-index__head {
          display: flex; flex-wrap: wrap; align-items: flex-start;
          justify-content: space-between; gap: 12px; margin-bottom: 16px;
        }
        .gold-index__title { margin: 0; font-size: clamp(1rem,3vw,1.2rem); font-family: var(--font-display); }

        /* export block */
        .gold-index__actions { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
        .gi-btn-refresh { white-space: nowrap; }
        .gi-export-block {
          display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px;
          background: var(--input-bg); border: 1px solid var(--stroke);
          border-radius: 12px; padding: 8px 12px;
        }
        .gi-export-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; width: 100%; margin-bottom: 2px; }
        .gi-export-dates { display: flex; flex-wrap: wrap; gap: 6px; }
        .gi-date-field { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
        .gi-date-field input { width: min(140px,42vw); }
        .gi-export-btns { display: flex; gap: 6px; margin-left: auto; }

        /* ── meta / legend ─────────────────────────────── */
        /* ── stats grid ─────────────────────────────────── */
        .gi-stats-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 10px; margin-bottom: 12px;
        }
        .gi-stat-card {
          display: flex; align-items: center; gap: 10px;
          background: var(--input-bg); border: 1px solid var(--stroke);
          border-radius: 12px; padding: 11px 13px;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .gi-stat-card:hover { border-color: rgba(232,197,71,0.4); box-shadow: 0 2px 10px rgba(184,134,11,0.08); }
        .gi-stat-icon { font-size: 1.4rem; flex-shrink: 0; line-height: 1; }
        .gi-stat-label { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 2px; }
        .gi-stat-value { font-size: 1rem; font-weight: 700; line-height: 1.2; }
        .gi-stat-unit { font-size: 0.72rem; font-weight: 400; color: var(--text-muted); margin-left: 2px; }
        @media (max-width: 480px) { .gi-stats-grid { grid-template-columns: 1fr 1fr; } }

        /* ── legend ─────────────────────────────────────── */
        .gold-index__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 10px; }
        .gi-legend-title { font-size: 0.76rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .gold-index__leg-item { font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px; }
        .gold-index__leg-item i { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; display: inline-block; }

        /* ── map ───────────────────────────────────────── */
        .gold-index__map-wrap {
          position: relative; margin-bottom: 14px;
          border-radius: 14px; overflow: hidden;
          border: 1px solid var(--stroke);
        }
        .gold-index__map {
          width: 100%; height: min(420px, 55vh); z-index: 0;
        }
        .gi-map-add-btn {
          position: absolute; bottom: 12px; right: 12px; z-index: 500;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 20px; border: none; cursor: pointer;
          background: rgba(255,253,248,0.92); color: #1a0e00;
          font-size: 13px; font-weight: 600;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          backdrop-filter: blur(6px);
          transition: all 0.18s;
        }
        .gi-map-add-btn:hover { background: #e8c547; box-shadow: 0 4px 14px rgba(184,134,11,0.4); }
        .gi-map-add-btn--active { background: #ef4444; color: #fff; }
        .gi-map-add-hint {
          position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 500;
          background: rgba(10,8,4,0.82); color: #faf8f4;
          padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500;
          pointer-events: none; white-space: nowrap; backdrop-filter: blur(4px);
          animation: gi-fade-in 0.2s ease;
        }
        @keyframes gi-pulse {
          0%,100% { box-shadow: 0 0 0 4px rgba(232,197,71,0.5); }
          50% { box-shadow: 0 0 0 10px rgba(232,197,71,0.0); }
        }
        .gold-index__chart {
          margin-bottom: 14px; background: var(--input-bg); border: 1px solid var(--stroke);
          border-radius: 14px; padding: 16px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .gi-price-chart { border-top: 3px solid #e8c547; }
        .gi-chart-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 6px; }
        .gi-chart-title-row { display: flex; flex-direction: column; gap: 2px; }
        .gi-chart-title { font-size: 0.95rem; font-weight: 700; color: var(--text); }
        .gi-chart-subtitle { font-size: 0.76rem; }
        .gi-probe-select { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .gi-chart-empty {
          display: flex; align-items: center; justify-content: center;
          gap: 10px; padding: 32px 16px;
          color: var(--text-muted); font-size: 0.85rem; text-align: center;
        }
        .gi-chart-empty-icon { font-size: 1.8rem; }

        /* ── toolbar ───────────────────────────────────── */
        .gold-index__toolbar {
          margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
        }
        .gi-filters { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
        .gi-filters .input { flex: 1; min-width: min(180px,100%); }
        .gi-add-city-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg,#b8860b,#e8c547);
          color: #1a0e00; font-weight: 700; font-size: 0.9rem;
          transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 2px 8px rgba(184,134,11,0.25);
        }
        .gi-add-city-btn:hover { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(184,134,11,0.35); }
        .gi-add-city-btn:active { transform: translateY(0); }
        .gi-add-city-btn--active { background: var(--input-bg); color: var(--text); border: 1px solid var(--stroke); box-shadow: none; }
        .gi-add-city-icon { font-size: 1.1rem; font-weight: 300; line-height: 1; }

        /* ── add-city form ──────────────────────────────── */
        .gold-index__form {
          margin-bottom: 16px; padding: clamp(10px,2vw,16px); border-radius: 12px;
          border: 1px solid var(--stroke); background: var(--input-bg);
          animation: gi-expand 0.22s ease both;
        }
        .gi-form-hint {
          display: flex; gap: 10px; align-items: flex-start;
          background: rgba(232,197,71,0.08); border: 1px solid rgba(232,197,71,0.2);
          border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;
          font-size: 0.83rem; line-height: 1.5; color: var(--text);
        }
        .gi-form-hint a { color: var(--gold); }
        .gi-form-hint-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
        .gold-index__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap: 10px; }
        .gold-index__probe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px,1fr)); gap: 8px; margin: 8px 0; }

        /* ── animations ─────────────────────────────────── */
        @keyframes gi-slide-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gi-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes gi-expand {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── city list ──────────────────────────────────── */
        .gold-index__cities { display: flex; flex-direction: column; gap: 10px; }
        .gold-index__city {
          padding: 0; overflow: hidden;
          border: 1px solid var(--stroke); border-radius: 14px; background: var(--input-bg);
          animation: gi-slide-up 0.28s ease both;
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .gold-index__city:hover { box-shadow: 0 2px 14px rgba(0,0,0,0.1); }
        .gold-index__city-head {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: clamp(10px,2vw,14px) clamp(12px,2vw,16px);
          background: transparent; border: none; color: inherit; cursor: pointer; text-align: left;
          transition: background 0.15s;
        }
        .gold-index__city-head:hover { background: var(--hover-bg,rgba(232,197,71,0.06)); }
        .gold-index__dot { width: 12px; height: 12px; border-radius: 999px; flex-shrink: 0; transition: transform 0.2s; }
        .gold-index__city-head:hover .gold-index__dot { transform: scale(1.25); }
        .gold-index__city-title { flex: 1; min-width: 0; overflow: hidden; }
        .gold-index__city-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
        .gold-index__ratio { font-weight: 700; color: var(--gold); margin-left: auto; white-space: nowrap; }
        .gold-index__city-body {
          padding: clamp(10px,2vw,14px) clamp(12px,2vw,16px);
          border-top: 1px solid var(--stroke);
          display: flex; flex-direction: column; gap: 0;
          animation: gi-expand 0.22s ease both;
        }

        /* ── city meta row ──────────────────────────────── */
        .gi-city-meta {
          display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
          font-size: 0.8rem; margin-bottom: 14px;
          padding-bottom: 12px; border-bottom: 1px solid var(--stroke);
        }
        .gi-edit-addr-btn { margin-left: auto; }

        /* ── competitor section header ──────────────────── */
        .gi-comp-section-head {
          display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
        }
        .gi-section-label {
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
        }
        .gi-comp-count {
          background: var(--gold); color: #1a1000;
          font-size: 0.7rem; font-weight: 700;
          border-radius: 99px; padding: 1px 7px; line-height: 1.6;
        }
        .gi-no-comp { margin-bottom: 10px; }

        /* ── danger zone ────────────────────────────────── */
        .gi-city-danger-zone {
          margin-top: 16px; padding-top: 12px;
          border-top: 1px dashed var(--stroke);
        }

        /* ── competitor cards ───────────────────────────── */
        .gi-comp-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .gi-comp-card {
          border: 1px solid var(--stroke); border-radius: 12px;
          overflow: hidden;
          animation: gi-slide-up 0.2s ease both;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .gi-comp-card:hover { border-color: rgba(232,197,71,0.5); box-shadow: 0 2px 10px rgba(184,134,11,0.1); }
        .gi-comp-card--editing { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(232,197,71,0.15); }
        /* Top accent bar */
        .gi-comp-card-bar { height: 3px; width: 100%; }
        .gi-comp-card-body { padding: 10px 12px; }
        .gi-comp-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .gi-comp-name { font-weight: 700; font-size: 0.95rem; letter-spacing: 0.01em; }
        .gi-comp-date { font-size: 0.76rem; color: var(--text-muted); }
        .gi-comp-ratio { font-size: 1.1rem; font-weight: 800; font-family: var(--font-mono,'monospace'); padding: 2px 10px; border-radius: 20px; }
        .gi-ratio--green  { color: #1a6637; background: rgba(34,197,94,0.12); }
        .gi-ratio--yellow { color: #92620a; background: rgba(234,179,8,0.12); }
        .gi-ratio--orange { color: #9a3d0a; background: rgba(249,115,22,0.12); }
        .gi-ratio--red    { color: #8c1c1c; background: rgba(239,68,68,0.12); }
        .gi-ratio--neutral{ color: #5a4200; background: rgba(232,197,71,0.12); }
        .gi-comp-address { margin-top: 2px; font-size: 0.74rem; }
        .gi-comp-coords-row { display: flex; align-items: flex-end; gap: 8px; margin-top: 6px; }
        .gi-comp-loc-btns { display: flex; gap: 4px; flex-shrink: 0; }
        .gi-comp-map-pin-btn {
          flex-shrink: 0; width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--stroke);
          background: var(--input-bg); cursor: pointer; font-size: 1.1rem; display: flex; align-items: center;
          justify-content: center; transition: all 0.15s;
        }
        .gi-comp-map-pin-btn:disabled { opacity: 0.5; cursor: default; }
        .gi-comp-map-pin-btn:hover:not(:disabled) { border-color: #38bdf8; background: rgba(56,189,248,0.1); }
        .gi-comp-map-pin-btn--active { background: #38bdf8; border-color: #38bdf8; }
        .gi-gps-btn:hover:not(:disabled) { border-color: #22c55e; background: rgba(34,197,94,0.12); }

        .gi-probe-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
        .gi-probe-chip {
          display: inline-flex; align-items: center; gap: 4px;
          background: var(--stroke); border-radius: 6px; padding: 2px 7px; font-size: 0.76rem;
        }
        .gi-probe-label { color: var(--text-muted); }
        .gi-probe-val { font-weight: 600; font-family: var(--font-mono,'monospace'); }

        .gi-comp-edit-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .gi-comp-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }

        /* ── history summary ────────────────────────────── */
        .gi-history-summary {
          display: flex; align-items: center; gap: 8px; list-style: none;
          margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--stroke);
        }
        .gi-history-summary::-webkit-details-marker { display: none; }

        /* ── add competitor toggle ──────────────────────── */
        .gi-add-comp-toggle-row { margin-top: 12px; }
        .gi-add-comp-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1.5px dashed var(--stroke);
          background: transparent; color: var(--gold); font-weight: 600; font-size: 0.82rem;
          cursor: pointer; transition: all 0.15s; letter-spacing: 0.02em;
        }
        .gi-add-comp-toggle:hover { border-color: var(--gold); background: rgba(232,197,71,0.06); }
        .gi-add-comp-toggle--open { border-style: solid; border-color: var(--gold); background: rgba(232,197,71,0.05); color: var(--text-muted); }

        /* ── new competitor form ────────────────────────── */
        .gi-new-comp { margin-top: 10px; animation: gi-expand 0.2s ease both; }

        /* ── history ────────────────────────────────────── */
        .gi-history-list { display: flex; flex-direction: column; gap: 6px; }
        .gi-history-row {
          display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px;
          font-size: 0.8rem; padding: 6px 0; border-bottom: 1px solid var(--stroke);
        }
        .gi-history-row:last-child { border-bottom: none; }
        .gi-history-badge {
          display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.05em; border-radius: 6px;
          padding: 2px 7px; white-space: nowrap; flex-shrink: 0;
        }
        .gi-history-badge--create { background: #d1f5e0; color: #1a6637; }
        .gi-history-badge--update { background: #fff3cd; color: #856404; }
        .gi-history-badge--delete { background: #fce4e4; color: #8c1c1c; }
        .gi-history-entity { white-space: nowrap; }
        .gi-history-who { flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gi-history-when { white-space: nowrap; margin-left: auto; }

        /* ── misc buttons ───────────────────────────────── */
        .btn-ghost.small { padding: 5px 10px; font-size: 0.78rem; }
        .btn-ghost.danger { color: var(--danger); }

        /* ── leaflet tooltip ────────────────────────────── */
        .gi-map-tooltip {
          font-size: 12px; font-family: inherit; padding: 6px 10px; border-radius: 8px;
          border: none; box-shadow: 0 2px 12px rgba(0,0,0,0.15);
          background: rgba(255,253,248,0.97); color: #1a0e00;
        }
        /* ── leaflet popup ───────────────────────────────── */
        .gi-city-popup .leaflet-popup-content-wrapper {
          border-radius: 12px; padding: 0; overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          border: 1px solid rgba(184,134,11,0.15);
          animation: gi-fade-in 0.18s ease;
        }
        .gi-city-popup .leaflet-popup-content { margin: 0; }
        .gi-city-popup .leaflet-popup-tip-container { display: none; }

        /* ── responsive tweaks ──────────────────────────── */
        @media (max-width: 540px) {
          .gold-index__actions { flex-direction: column; align-items: stretch; }
          .gi-export-block { width: 100%; }
          .gi-export-btns { width: 100%; }
          .gi-export-btns button { flex: 1; }
          .gi-export-dates { width: 100%; }
          .gi-date-field input { width: 100%; flex: 1; }
          .gold-index__toolbar { flex-direction: column; align-items: stretch; }
          .gi-filters { flex-direction: column; }
          .gi-comp-header { flex-direction: column; gap: 4px; }
          .gi-history-who { white-space: normal; }
          .gi-history-when { margin-left: 0; }
        }
      `}</style>
    </section>
  );
}

function formatCityAddressLine(c) {
  const line = [c.street, c.building].filter(Boolean).join(', ');
  const bits = [];
  if (line) bits.push(line);
  if (c.address_note) bits.push(String(c.address_note));
  if (bits.length) return bits.join(' · ');
  return c.geocoded_label ? String(c.geocoded_label) : '';
}

function formatHistoryDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU');
}

function historyActionLabel(a) {
  if (a === 'create') return 'Создание';
  if (a === 'update') return 'Изменение';
  if (a === 'delete') return 'Удаление';
  return String(a || '—');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
