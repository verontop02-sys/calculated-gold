import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { SiteTrafficBlock } from './TrafficStudio';

function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

function addMonths(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return toIso(d);
}

function humanDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.\s*$/, '');
}

const PRESETS = [
  ['today', 'Сегодня'],
  ['7d', '7 дней'],
  ['30d', '30 дней'],
  ['90d', '90 дней'],
  ['month', 'Месяц'],
  ['ytd', 'С 1 янв.'],
];

export default function TrafficPage() {
  const today = toIso(new Date());
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState('30d');
  const [traffic, setTraffic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTraffic(await api.analyticsTraffic(from, to));
    } catch (e) {
      const raw = String(e?.message || '');
      setError(/load failed|failed to fetch|networkerror/i.test(raw)
        ? 'Нет связи с сервером. Обновите страницу.'
        : (raw || 'Не удалось загрузить посещаемость'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(id) {
    const t = toIso(new Date());
    setPreset(id);
    setTo(t);
    if (id === 'today') setFrom(t);
    else if (id === '7d') setFrom(addDays(t, -6));
    else if (id === '30d') setFrom(addDays(t, -29));
    else if (id === '90d') setFrom(addDays(t, -89));
    else if (id === 'month') setFrom(addMonths(t, -1));
    else if (id === 'ytd') setFrom(`${new Date().getFullYear()}-01-01`);
  }

  return (
    <div className="tv-page">
      <header className="tv-hero glass">
        <div>
          <p className="tv-kicker">Сайты</p>
          <h2>Посещаемость</h2>
          <p className="muted">{`С ${humanDate(from)} по ${humanDate(to)}. Здесь только визиты reaktivo.pro и reaktivo.ru: страницы, источники и часы. Сделки остаются в разделе «Аналитика».`}</p>
        </div>
        <div className="tv-presets" role="group" aria-label="Период">
          {PRESETS.map(([id, label]) => (
            <button key={id} type="button" className={preset === id ? 'is-on' : ''} onClick={() => applyPreset(id)}>{label}</button>
          ))}
        </div>
        <div className="tv-dates">
          <label>С<input type="date" value={from} onChange={(e) => { setPreset(''); setFrom(e.target.value); }} /></label>
          <label>По<input type="date" value={to} onChange={(e) => { setPreset(''); setTo(e.target.value); }} /></label>
          <button type="button" onClick={load} disabled={loading}>{loading ? 'Считаем…' : 'Обновить'}</button>
        </div>
      </header>
      <SiteTrafficBlock traffic={traffic} loading={loading} error={error} />
      <section className="tv-help glass">
        <h3>Как читать цифры</h3>
        <dl>
          <div>
            <dt>Визит</dt>
            <dd>Одно открытие сайта в браузере. Пока вкладка открыта, все страницы внутри неё считаются одним визитом. Закрыл и зашёл снова: это уже новый визит.</dd>
          </div>
          <div>
            <dt>Просмотр</dt>
            <dd>Каждая открытая публичная страница. Панель, кабинет и экран подтверждения в счётчик не попадают.</dd>
          </div>
          <div>
            <dt>Источник</dt>
            <dd>Сайт, с которого пришли в первый раз за этот визит. Прямой заход значит, что адрес набрали сами или открыли из закладок. Поиск, соцсети и чужие сайты видны в разделе «Источники».</dd>
          </div>
          <div>
            <dt>Сравнение</dt>
            <dd>Процент рядом с визитами сравнивает выбранный период с предыдущим отрезком той же длины. Период считается по московским суткам.</dd>
          </div>
        </dl>
      </section>
      <style>{TRAFFIC_CSS}</style>
    </div>
  );
}

const TRAFFIC_CSS = `
.tv-page { display: grid; gap: 16px; color: var(--text); }
.tv-hero { display: grid; gap: 12px; padding: 18px; }
.tv-kicker { margin: 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); }
.tv-hero h2 { margin: 2px 0 0; font-size: 1.7rem; letter-spacing: -0.03em; }
.tv-hero .muted { margin: 6px 0 0; max-width: 760px; line-height: 1.45; }
.tv-presets, .tv-dates { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tv-presets button, .tv-dates button, .tv-dates input {
  border: 1px solid var(--stroke); background: transparent; color: inherit; border-radius: 999px; padding: 7px 12px; font: inherit; cursor: pointer;
}
.tv-presets button.is-on, .tv-dates button { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, transparent); font-weight: 700; }
.tv-dates label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--text-dim); }
.tv-help { padding: 16px 18px; }
.tv-help h3 { margin: 0 0 10px; font-size: 1rem; }
.tv-help dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
.tv-help div { display: grid; gap: 4px; }
.tv-help dt { font-weight: 700; }
.tv-help dd { margin: 0; color: var(--text-dim); line-height: 1.45; font-size: 0.88rem; }
.tv-err { margin: 0; color: var(--crimson, #d63b3b); }
.tv-sites { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tv-site { text-align: left; border: 1px solid var(--stroke); background: var(--bg-panel-solid); color: inherit; border-radius: 16px; padding: 14px; cursor: pointer; font: inherit; display: grid; gap: 4px; }
.tv-site strong { font-size: 1.8rem; letter-spacing: -0.03em; line-height: 1; }
.tv-site small { color: var(--text-muted); }
.tv-site--pro { border-top: 3px solid #c41e22; }
.tv-site--ru { border-top: 3px solid #c9a227; }
.tv-site--all { border-top: 3px solid var(--gold); }
.tv-site.is-on { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.tv-split { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 14px; align-items: start; }
.tv-rail { display: grid; gap: 8px; position: sticky; top: 12px; }
.tv-rail button { text-align: left; border: 1px solid var(--stroke); background: var(--bg-panel-solid); color: inherit; border-radius: 14px; padding: 12px; cursor: pointer; font: inherit; display: grid; gap: 4px; }
.tv-rail button b { font-size: 0.95rem; }
.tv-rail button small { color: var(--text-muted); font-weight: 400; line-height: 1.35; }
.tv-rail button.is-on { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 12%, var(--bg-panel-solid)); }
.tv-main { padding: 16px; display: grid; gap: 14px; min-width: 0; }
.an-delta { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; width: fit-content; }
.an-delta--up { background: var(--emerald-soft); color: var(--emerald); }
.an-delta--down { background: rgba(176, 56, 56, 0.15); color: var(--crimson); }
.an-delta--flat { background: var(--surface); color: var(--text-muted); border: 1px solid var(--stroke-soft); }
.an-tt { background: var(--bg-panel-solid); border: 1px solid var(--stroke-strong); border-radius: 10px; padding: 8px 12px; font-size: 0.82rem; }
.an-tt__label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.an-tt__val { font-weight: 700; color: var(--gold); }
.an-tt__sub { margin-top: 2px; font-size: 0.78rem; }
.an-leg-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; margin-right: 10px; font-weight: 600; }
.an-leg-pill::before { content: ''; width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.an-leg-pill--pro::before { background: #c41e22; }
.an-leg-pill--ru::before { background: #c9a227; }
.an-traffic { display: grid; gap: 14px; }
.an-traffic .analytics-chart-h { height: 260px; width: 100%; min-width: 0; }
.an-traffic__read { margin: 0; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--gold) 8%, transparent); line-height: 1.45; }
.an-traffic__metric-toggle { display: flex; gap: 8px; }
.an-traffic__metric-toggle button { border: 1px solid var(--stroke); background: transparent; color: inherit; border-radius: 999px; padding: 5px 10px; cursor: pointer; font: inherit; font-size: 0.8rem; }
.an-traffic__metric-toggle button.is-on { border-color: var(--gold); color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, transparent); }
.an-traffic__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.an-traffic__kpis article { border: 1px solid var(--stroke); border-radius: 14px; padding: 12px; min-width: 0; display: grid; gap: 4px; align-content: start; background: var(--bg-panel-solid); }
.an-traffic__kpis span, .an-traffic__kpis small { font-size: 0.75rem; color: var(--text-dim); }
.an-traffic__kpis b { font-size: 1.6rem; letter-spacing: -0.03em; line-height: 1; }
.an-traffic__chart-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; }
.an-traffic__chart-head h4, .an-studio h4 { margin: 0; font-size: 0.95rem; }
.an-traffic__legend { display: flex; gap: 8px; align-items: center; }
.an-traffic__hour-bars { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; }
.an-traffic__hour-bars div { min-width: 0; }
.an-traffic__hour-track { display: flex; align-items: flex-end; height: 96px; }
.an-traffic__hour-track i { display: block; width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: #c41e22; }
.an-traffic__hour-bars div > span:last-child { display: block; height: 14px; font-size: 0.62rem; color: var(--text-muted); text-align: center; margin-top: 3px; }
.an-studio { display: grid; gap: 14px; }
.an-studio__summary, .an-studio__pane { display: grid; gap: 14px; }
.an-studio__notes { display: grid; gap: 6px; }
.an-studio__notes p { margin: 0; line-height: 1.45; }
.an-studio__depth-top, .an-studio__daycard { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.an-studio__depth-bar, .an-studio__groups i, .an-studio__sources i { display: block; height: 8px; border-radius: 99px; background: color-mix(in srgb, var(--stroke) 70%, transparent); overflow: hidden; }
.an-studio__depth-bar i { display: block; height: 100%; background: #c41e22; }
.an-studio__compare, .an-studio__groups, .an-studio__detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.an-studio__groups { grid-template-columns: repeat(3, 1fr); }
.an-studio__site, .an-studio__groups button { text-align: left; border: 1px solid var(--stroke); background: transparent; color: inherit; border-radius: 14px; padding: 12px; cursor: pointer; font: inherit; display: grid; gap: 4px; min-width: 0; }
.an-studio__site--pro { border-top: 3px solid #c41e22; }
.an-studio__site--ru { border-top: 3px solid #c9a227; }
.an-studio__site strong, .an-studio__groups strong { font-size: 1.4rem; line-height: 1; }
.an-studio__groups button.is-on, .an-studio__site:hover { border-color: var(--gold); }
.an-studio__groups small, .an-studio__table small, .an-studio__sources small { display: block; color: var(--text-muted); font-weight: 400; }
.an-studio__groups i { margin-top: 6px; }
.an-studio__groups em, .an-studio__sources em { display: block; height: 100%; background: var(--gold); }
.an-studio__flows ul, .an-studio__mini, .an-studio__sources { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.an-studio__flows li, .an-studio__mini li, .an-studio__sources li { display: grid; grid-template-columns: 1fr auto auto auto; gap: 8px; align-items: center; }
.an-studio__mini li, .an-studio__sources li { grid-template-columns: 1fr auto; }
.an-studio__sources i { grid-column: 1 / -1; }
.an-studio__source-num { display: grid; justify-items: end; gap: 2px; font-size: 0.78rem; color: var(--text-muted); }
.an-studio__source-num strong { font-size: 1rem; color: var(--text); }
.an-studio__flows i { font-style: normal; color: var(--text-muted); font-size: 0.75rem; }
.an-studio__tools, .an-studio__search { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; }
.an-studio__tools p { margin: 0; flex: 1 1 220px; }
.an-studio__search { display: grid; gap: 4px; justify-items: start; }
.an-studio__search input { border: 1px solid var(--stroke); background: transparent; color: inherit; border-radius: 10px; padding: 8px 10px; font: inherit; min-width: min(100%, 280px); }
.an-studio__table-wrap { overflow: auto; max-height: 560px; border: 1px solid var(--stroke); border-radius: 12px; }
.an-studio__table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.an-studio__table th, .an-studio__table td { padding: 11px 14px; border-bottom: 1px solid var(--stroke); text-align: left; vertical-align: middle; }
.an-studio__table th { position: sticky; top: 0; background: var(--bg-panel-solid); color: var(--text-dim); font-size: 0.72rem; font-weight: 700; }
.an-studio__table th.num, .an-studio__table td.num, .an-studio__table th.site, .an-studio__table td.site { width: 1%; white-space: nowrap; }
.an-studio__table th.num, .an-studio__table td.num { text-align: right; }
.an-studio__table th.site, .an-studio__table td.site { text-align: center; }
.an-studio__table td.site { font-weight: 700; }
.an-studio__table td b { display: block; }
.an-studio__table td small { display: block; margin-top: 2px; }
.an-studio__table tbody tr { cursor: pointer; }
.an-studio__table tbody tr.is-open td { background: color-mix(in srgb, var(--gold) 8%, transparent); }
.an-studio__table tbody tr.is-hot td:first-child { color: var(--gold); font-weight: 700; }
.an-studio__detail td { cursor: default; background: color-mix(in srgb, var(--gold) 5%, transparent); }
.an-studio__week { height: 220px; }
.an-studio__daycard { border: 1px solid var(--stroke); border-radius: 12px; padding: 10px 12px; }
@media (max-width: 900px) {
  .tv-sites, .tv-split, .tv-help dl, .an-traffic__kpis, .an-studio__compare, .an-studio__groups, .an-studio__detail-grid { grid-template-columns: 1fr; }
  .tv-rail { position: static; grid-auto-flow: column; grid-auto-columns: minmax(180px, 70%); overflow-x: auto; }
}
`;
