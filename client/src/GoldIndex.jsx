import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from './api.js';

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
  /** После первого успешного ответа не включаем «полный» loading — иначе размонтируется карта и ломается Leaflet. */
  const hasLoadedOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [showCityForm, setShowCityForm] = useState(false);
  const [cityDraft, setCityDraft] = useState({
    region_code: '',
    region_name: '',
    city_name: '',
    lat: '',
    lng: '',
    population: '',
    notes: '',
  });
  const [compDraftByCity, setCompDraftByCity] = useState({});

  const load = useCallback(async () => {
    setErr('');
    if (!hasLoadedOnceRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await api.goldIndexOverview();
      setData(d);
      hasLoadedOnceRef.current = true;
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить');
      setData(null);
      hasLoadedOnceRef.current = false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cities = data?.cities || [];
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

  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstRef.current) {
      const m = L.map(mapRef.current, { scrollWheelZoom: true }).setView([61.5, 105], 3);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18,
      }).addTo(m);
      mapInstRef.current = m;
      layerRef.current = L.layerGroup().addTo(m);
    }
    const layer = layerRef.current;
    const m = mapInstRef.current;
    layer.clearLayers();
    for (const c of cities) {
      const fill = COLOR_HEX[c.colorKey] || COLOR_HEX.neutral;
      const mk = L.circleMarker([c.lat, c.lng], {
        radius: 9,
        color: '#1e293b',
        weight: 1,
        fillColor: fill,
        fillOpacity: 0.92,
      });
      mk.bindPopup(
        `<strong>${escapeHtml(c.city_name)}</strong><br/>${escapeHtml(c.region_name)}<br/>Индекс: ${fmtRatio(c.ratioAvg)}`
      );
      mk.on('click', () => {
        setExpanded((prev) => new Set(prev).add(c.id));
      });
      mk.addTo(layer);
    }
    if (cities.length === 1) {
      m.setView([cities[0].lat, cities[0].lng], 8);
    }
    requestAnimationFrame(() => {
      try {
        mapInstRef.current?.invalidateSize();
      } catch {
        /* ignore */
      }
    });
    return () => {};
  }, [cities]);

  useEffect(() => {
    return () => {
      mapInstRef.current?.remove();
      mapInstRef.current = null;
      layerRef.current = null;
    };
  }, []);

  async function handlePdf() {
    setPdfBusy(true);
    try {
      const blob = await api.goldIndexReportPdf();
      downloadBlob(blob, `gold-index-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast('PDF сохранён', 'success');
    } catch (e) {
      toast(e?.message || 'Ошибка PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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

  async function submitCity(e) {
    e.preventDefault();
    try {
      await api.goldIndexCreateCity({
        region_code: cityDraft.region_code,
        region_name: cityDraft.region_name,
        city_name: cityDraft.city_name,
        lat: parseFloat(String(cityDraft.lat).replace(',', '.')),
        lng: parseFloat(String(cityDraft.lng).replace(',', '.')),
        population: cityDraft.population === '' ? null : cityDraft.population,
        notes: cityDraft.notes || null,
      });
      toast('Город добавлен', 'success');
      setShowCityForm(false);
      setCityDraft({
        region_code: '',
        region_name: '',
        city_name: '',
        lat: '',
        lng: '',
        population: '',
        notes: '',
      });
      await load();
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
      });
      toast('Конкурент добавлен', 'success');
      setCompDraft(cityId, { company_name: '', measured_at: '', probes: {}, notes: '' });
      await load();
    } catch (err2) {
      toast(err2?.message || 'Ошибка', 'error');
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

  async function deleteCompetitor(id) {
    if (!window.confirm('Удалить компанию из списка?')) return;
    try {
      await api.goldIndexDeleteCompetitor(id);
      toast('Удалено', 'success');
      await load();
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
          <button type="button" className="btn-ghost" disabled={pdfBusy || loading || refreshing} onClick={() => load()}>
            Обновить
          </button>
          <button type="button" className="btn-primary" disabled={pdfBusy || loading || refreshing} onClick={handlePdf}>
            {pdfBusy ? 'PDF…' : 'Скачать PDF'}
          </button>
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
          <div className="gold-index__meta mono-nums">
            <span>
              Биржа (эталон):{' '}
              <strong>{data.goldRubPerGram != null ? formatMoney(data.goldRubPerGram) : '—'} / г</strong>
            </span>
            <span>
              Выкуп лома: <strong>{data.settingsSnapshot?.buybackPercentOfScrap ?? '—'}%</strong>
            </span>
            <span>
              Городов: <strong>{data.stats?.cityCount ?? 0}</strong> · Охват населения:{' '}
              <strong>
                {data.stats?.populationCovered != null
                  ? new Intl.NumberFormat('ru-RU').format(data.stats.populationCovered)
                  : '—'}
              </strong>
            </span>
          </div>

          <div className="gold-index__legend">
            <span className="muted small">Легенда индекса:</span>
            {[
              ['green', 'ниже порога 1'],
              ['yellow', 'умеренно'],
              ['orange', 'выше'],
              ['red', 'значительно выше'],
            ].map(([k, label]) => (
              <span key={k} className="gold-index__leg-item">
                <i style={{ background: COLOR_HEX[k] }} /> {label}
              </span>
            ))}
            <span className="muted small" style={{ marginLeft: 8 }}>
              Пороги ENV: GOLD_INDEX_THRESHOLDS (три числа через запятую).
            </span>
          </div>

          <div ref={mapRef} className="gold-index__map" />

          {regionsChart.length > 0 && (
            <div className="gold-index__chart">
              <p className="muted small" style={{ marginBottom: 8 }}>
                Средний индекс по регионам (где есть данные)
              </p>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={regionsChart} margin={{ top: 6, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(v) => [fmtRatio(v), 'Индекс']}
                      labelFormatter={(_, p) => p?.[0]?.payload?.full || ''}
                    />
                    <Bar dataKey="ratio" fill="#e8c547" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="gold-index__toolbar">
            <button type="button" className="btn-primary" onClick={() => setShowCityForm((v) => !v)}>
              {showCityForm ? 'Скрыть форму' : '+ Город'}
            </button>
          </div>

          {showCityForm && (
            <form className="gold-index__form" onSubmit={submitCity}>
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
            {cities.map((c) => (
              <div key={c.id} className="gold-index__city">
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
                    <p className="muted small">
                      Координаты {c.lat?.toFixed?.(4)}, {c.lng?.toFixed?.(4)}
                      {c.population != null ? ` · население ${c.population}` : ''}
                    </p>
                    <button type="button" className="btn-ghost small danger" onClick={() => deleteCity(c.id)}>
                      Удалить город
                    </button>

                    <table className="gold-index__table">
                      <thead>
                        <tr>
                          <th>Компания</th>
                          <th>Индекс</th>
                          <th>Пробы ₽/г</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(c.competitors || []).map((co) => (
                          <tr key={co.id}>
                            <td>{co.companyName}</td>
                            <td className="mono-nums">{fmtRatio(co.ratioAvg)}</td>
                            <td className="small">
                              {Object.entries(co.probes || {})
                                .map(([k, v]) => `${k}: ${formatMoney(typeof v === 'number' ? v : Number(v))}`)
                                .join(' · ') || '—'}
                            </td>
                            <td>
                              <button type="button" className="btn-ghost small" onClick={() => deleteCompetitor(co.id)}>
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="gold-index__add-comp">
                      <p className="muted small">Новый конкурент</p>
                      <div className="gold-index__grid">
                        <label className="field">
                          <span className="field-label">Компания</span>
                          <input
                            className="input"
                            value={compDraftByCity[c.id]?.company_name || ''}
                            onChange={(e) => setCompDraft(c.id, { company_name: e.target.value })}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Дата замера</span>
                          <input
                            className="input"
                            type="date"
                            value={compDraftByCity[c.id]?.measured_at || ''}
                            onChange={(e) => setCompDraft(c.id, { measured_at: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="gold-index__probe-grid">
                        {probeFieldsForCity(c.id).probes.map((pb) => (
                          <label key={pb} className="field">
                            <span className="field-label">{pb}</span>
                            <input
                              className="input mono-nums"
                              inputMode="decimal"
                              placeholder="₽/г"
                              value={compDraftByCity[c.id]?.probes?.[pb] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCompDraft(c.id, {
                                  probes: { ...(compDraftByCity[c.id]?.probes || {}), [pb]: v },
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <button type="button" className="btn-primary" onClick={() => submitCompetitor(c.id)}>
                        Добавить конкурента
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
        .gold-index { padding: 18px 16px 22px; border-radius: 16px; margin-bottom: 16px; }
        .gold-index__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .gold-index__title { margin: 0; font-size: 1.15rem; font-family: var(--font-display); }
        .gold-index__actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .gold-index__meta {
          display: flex; flex-wrap: wrap; gap: 10px 16px; font-size: 0.82rem; margin-bottom: 12px;
        }
        .gold-index__legend { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }
        .gold-index__leg-item { font-size: 0.75rem; display: inline-flex; align-items: center; gap: 6px; }
        .gold-index__leg-item i { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
        .gold-index__map {
          width: 100%; height: min(420px, 55vh); border-radius: 14px; overflow: hidden;
          border: 1px solid var(--stroke); margin-bottom: 14px; z-index: 0;
        }
        .gold-index__chart { margin-bottom: 14px; }
        .gold-index__toolbar { margin-bottom: 10px; }
        .gold-index__form { margin-bottom: 16px; padding: 12px; border-radius: 12px; border: 1px solid var(--stroke); background: var(--input-bg); }
        .gold-index__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
        .gold-index__probe-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; margin: 10px 0; }
        .gold-index__cities { display: flex; flex-direction: column; gap: 10px; }
        .gold-index__city { padding: 0; overflow: hidden; border: 1px solid var(--stroke); border-radius: 14px; background: var(--input-bg); }
        .gold-index__city-head {
          width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 14px;
          background: transparent; border: none; color: inherit; cursor: pointer; text-align: left;
        }
        .gold-index__dot { width: 12px; height: 12px; border-radius: 999px; flex-shrink: 0; }
        .gold-index__city-title { flex: 1; min-width: 0; }
        .gold-index__ratio { font-weight: 600; color: var(--gold); }
        .gold-index__city-body { padding: 0 14px 14px; border-top: 1px solid var(--stroke); }
        .gold-index__table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin: 10px 0; }
        .gold-index__table th, .gold-index__table td { padding: 8px 6px; border-bottom: 1px solid var(--stroke); text-align: left; vertical-align: top; }
        .gold-index__table th { color: var(--text-muted); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
        .gold-index__add-comp { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--stroke); }
        .btn-ghost.small { padding: 6px 10px; font-size: 0.78rem; }
        .btn-ghost.danger { color: var(--danger); }
      `}</style>
    </section>
  );
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
