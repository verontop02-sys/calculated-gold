import { Fragment, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEK_FULL = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const GROUP_ORDER = ['search', 'direct', 'social', 'referral', 'own'];
const GROUP_LABEL = {
  search: 'Поиск',
  direct: 'Прямой заход',
  social: 'Соцсети и мессенджеры',
  referral: 'Другие сайты',
  own: 'С нашего сайта',
};
const GROUP_HINT = {
  search: 'Яндекс, Google и другие поисковики',
  direct: 'Адрес набрали сами или открыли из закладки',
  social: 'Telegram, ВКонтакте, YouTube и остальные',
  referral: 'Ссылка с чужого сайта',
  own: 'Перешли между reaktivo.pro и reaktivo.ru',
};
const PAGE_TITLES = {
  '/': 'Главная',
  '/invest': 'Витрина изделий',
  '/privacy': 'Политика данных',
  '/prodat': 'Продать золото',
  '/kurier': 'Вызов курьера',
  '/slitki': 'Слитки',
  '/resale': 'Проверенные украшения',
  '/agenty': 'Агенты',
  '/franshiza': 'Франшиза',
  '/partneram': 'Партнёрам',
  '/o-kompanii': 'О компании',
};
const SECTIONS = [
  ['summary', 'Сводка'],
  ['pages', 'Страницы'],
  ['sources', 'Источники'],
  ['time', 'Время'],
  ['days', 'По дням'],
];

function humanDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function humanDateShort(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]}`;
}
function pluralRu(n, one, few, many) {
  const a = Math.abs(Number(n) || 0) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
function delta(now, prev) {
  const n = Number(now);
  const p = Number(prev);
  if (!Number.isFinite(n) || !Number.isFinite(p)) return null;
  if (p === 0 && n === 0) return { pct: 0, tone: 'flat' };
  if (p === 0) return { pct: null, tone: n > 0 ? 'up' : 'flat' };
  const pct = ((n - p) / Math.abs(p)) * 100;
  const tone = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';
  return { pct, tone };
}
function DeltaBadge({ d }) {
  if (!d) return <span className="an-delta an-delta--flat">—</span>;
  const txt = d.pct == null ? 'новое' : `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(d.pct >= 100 || d.pct <= -100 ? 0 : 1)}%`;
  const arrow = d.tone === 'up' ? '▲' : d.tone === 'down' ? '▼' : '•';
  return <span className={`an-delta an-delta--${d.tone}`}><span className="an-delta__arrow">{arrow}</span>{txt}</span>;
}
function pageInfo(path, site) {
  const raw = String(path || '/');
  const stripped = raw === '/ru' ? '/' : raw.startsWith('/ru/') ? `/${raw.slice(4)}` : raw;
  let title = PAGE_TITLES[stripped] || stripped;
  if (stripped === '/' && site === 'pro' && !raw.startsWith('/ru')) title = 'Главная, вызов курьера';
  if (stripped === '/' && site === 'ru') title = 'Главная выкупа';
  const viaPro = site === 'pro' && (raw === '/ru' || raw.startsWith('/ru/'));
  return { title, path: raw, note: viaPro ? 'Раздел Ru открыли на адресе reaktivo.pro' : '' };
}
function fmtDepth(views, visits) {
  if (!visits) return '—';
  return (views / visits).toFixed(1).replace('.', ',');
}
function share(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}
function mergeBuckets(a = [], b = [], key, len) {
  return Array.from({ length: len }, (_, i) => ({
    [key]: a[i]?.[key] ?? b[i]?.[key] ?? i,
    visits: (a[i]?.visits || 0) + (b[i]?.visits || 0),
    views: (a[i]?.views || 0) + (b[i]?.views || 0),
  }));
}
function mergeSources(a = [], b = []) {
  const map = new Map();
  for (const row of [...a, ...b]) {
    const id = row.group === 'direct' ? 'direct' : `${row.group}|${row.host || row.label}`;
    const prev = map.get(id);
    if (!prev) map.set(id, { ...row, visits: row.visits || 0 });
    else prev.visits += row.visits || 0;
  }
  return [...map.values()].sort((x, y) => y.visits - x.visits || String(x.label).localeCompare(String(y.label), 'ru'));
}
function mergeGroups(a, b) {
  if (!a && !b) return null;
  const out = {};
  for (const key of GROUP_ORDER) out[key] = (a?.[key] || 0) + (b?.[key] || 0);
  return out;
}
function peakHour(hours) {
  return (hours || []).reduce((top, row) => (!top || row.visits > top.visits ? row : top), null);
}
function viewOf(focus, sites) {
  const pro = sites?.pro || {};
  const ru = sites?.ru || {};
  if (focus === 'pro' || focus === 'ru') {
    const row = focus === 'pro' ? pro : ru;
    return {
      visits: row.visits || 0,
      views: row.views || 0,
      prevVisits: row.prevVisits || 0,
      prevViews: row.prevViews || 0,
      pages: (row.pages || []).map((p) => ({ ...p, site: focus })),
      sources: row.sources || [],
      hours: row.hours || [],
      week: row.week || [],
      groups: row.groups || null,
      depth: row.depth || null,
      flows: (row.flows || []).map((f) => ({ ...f, site: focus })),
    };
  }
  return {
    visits: (pro.visits || 0) + (ru.visits || 0),
    views: (pro.views || 0) + (ru.views || 0),
    prevVisits: (pro.prevVisits || 0) + (ru.prevVisits || 0),
    prevViews: (pro.prevViews || 0) + (ru.prevViews || 0),
    pages: [
      ...(pro.pages || []).map((p) => ({ ...p, site: 'pro' })),
      ...(ru.pages || []).map((p) => ({ ...p, site: 'ru' })),
    ].sort((a, b) => (b.views || 0) - (a.views || 0)),
    sources: mergeSources(pro.sources, ru.sources),
    hours: mergeBuckets(pro.hours, ru.hours, 'hour', 24),
    week: mergeBuckets(pro.week, ru.week, 'dow', 7),
    groups: mergeGroups(pro.groups, ru.groups),
    depth: pro.depth || ru.depth ? {
      one: (pro.depth?.one || 0) + (ru.depth?.one || 0),
      more: (pro.depth?.more || 0) + (ru.depth?.more || 0),
    } : null,
    flows: [
      ...(pro.flows || []).map((f) => ({ ...f, site: 'pro' })),
      ...(ru.flows || []).map((f) => ({ ...f, site: 'ru' })),
    ].sort((a, b) => b.visits - a.visits).slice(0, 8),
  };
}
function trafficReading(focus, view, startedOn) {
  const who = focus === 'pro' ? 'На reaktivo.pro' : focus === 'ru' ? 'На reaktivo.ru' : 'На оба сайта';
  if (!view.visits) {
    const since = startedOn ? ` Счётчик включён ${humanDate(startedOn)}.` : '';
    return `За эти дни заходов нет.${since} Старые цифры Яндекса сюда не попадают.`;
  }
  const depth = view.views / view.visits;
  const depthText = depth < 1.3
    ? 'Обычно открывают одну страницу и уходят.'
    : `В среднем ${fmtDepth(view.views, view.visits)} страницы за визит.`;
  const topPage = view.pages?.[0];
  const where = focus === 'all' && topPage?.site ? (topPage.site === 'pro' ? ' на Pro' : ' на Ru') : '';
  const pageBit = topPage ? ` Чаще всего смотрят «${pageInfo(topPage.path, topPage.site || focus).title}»${where}.` : '';
  return `${who} ${view.visits} ${pluralRu(view.visits, 'визит', 'визита', 'визитов')} и ${view.views} ${pluralRu(view.views, 'просмотр', 'просмотра', 'просмотров')}. ${depthText}${pageBit}`;
}
function insights(view) {
  if (!view.visits) return ['За эти дни заходов нет. Разбор заполнится, когда кто-то откроет сайт.'];
  const lines = [];
  const known = (view.depth?.one || 0) + (view.depth?.more || 0);
  if (known) {
    const left = Math.round((view.depth.one / known) * 100);
    lines.push(left >= 70
      ? `${left}% людей закрыли сайт на первой странице. В разделе «Страницы» видно, какая это была.`
      : `${100 - left}% людей после первой страницы открыли ещё хотя бы одну.`);
  }
  const groups = view.groups;
  if (groups) {
    const top = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
    if (top?.[1]) lines.push(`Главный канал первого захода: ${GROUP_LABEL[top[0]] || top[0]}, ${share(top[1], view.visits)} визитов.`);
  }
  const bestHour = peakHour(view.hours);
  if (bestHour?.visits) lines.push(`Больше всего первых заходов в ${String(bestHour.hour).padStart(2, '0')}:00 по Москве.`);
  const bestDay = (view.week || []).reduce((top, row) => (!top || row.visits > top.visits ? row : top), null);
  if (bestDay?.visits) lines.push(`По дням недели чаще заходят в ${WEEK_FULL[bestDay.dow]}.`);
  return lines;
}

function TrafficChart({ series, metric, lineKeys }) {
  return (
    <div className="analytics-chart-h an-traffic__chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, #333)" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => humanDateShort(v)} stroke="var(--text-muted)" minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} stroke="var(--text-muted)" width={32} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const p = payload[0].payload;
              return (
                <div className="an-tt">
                  <div className="an-tt__label">{humanDate(p.date)}</div>
                  <div className="an-tt__val">Pro: {p.proVisits} {pluralRu(p.proVisits, 'визит', 'визита', 'визитов')}, {p.proViews} просм.</div>
                  <div className="an-tt__sub">Ru: {p.ruVisits} {pluralRu(p.ruVisits, 'визит', 'визита', 'визитов')}, {p.ruViews} просм.</div>
                </div>
              );
            }}
          />
          {lineKeys.map((line) => (
            <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.4} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryPane({ focus, view, pro, ru, onSite }) {
  const known = (view.depth?.one || 0) + (view.depth?.more || 0);
  const left = known ? Math.round((view.depth.one / known) * 100) : 0;
  const rows = focus === 'all'
    ? [['pro', 'reaktivo.pro', pro], ['ru', 'reaktivo.ru', ru]]
    : [[focus, focus === 'pro' ? 'reaktivo.pro' : 'reaktivo.ru', focus === 'pro' ? pro : ru]];
  return (
    <div className="an-studio__summary">
      <div className="an-studio__notes">
        {insights(view).map((line) => <p key={line}>{line}</p>)}
      </div>
      {known > 0 && (
        <div className="an-studio__depth">
          <div className="an-studio__depth-top">
            <span>Ушли с первой страницы, {left}%</span>
            <span>Пошли дальше, {100 - left}%</span>
          </div>
          <div className="an-studio__depth-bar" aria-hidden="true">
            <i style={{ width: `${left}%` }} />
          </div>
          <small className="muted">На одной странице: {view.depth.one}. Дальше пошли: {view.depth.more}.</small>
        </div>
      )}
      <div className="an-studio__compare">
        {rows.map(([id, host, row]) => {
          const hour = peakHour(row?.hours);
          const top = row?.pages?.[0];
          return (
            <button key={id} type="button" className={`an-studio__site an-studio__site--${id}`} onClick={() => onSite(id)}>
              <b>{host}</b>
              <strong className="mono-nums">{row?.visits || 0}</strong>
              <span>{pluralRu(row?.visits || 0, 'визит', 'визита', 'визитов')}, {row?.views || 0} просм.</span>
              <span>{top ? `Чаще «${pageInfo(top.path, id).title}»` : 'Страниц пока нет'}</span>
              <span>{hour?.visits ? `Пик в ${String(hour.hour).padStart(2, '0')}:00` : 'Часа пика пока нет'}</span>
            </button>
          );
        })}
      </div>
      <div className="an-studio__flows">
        <h4>Куда идут после первой страницы</h4>
        {(view.flows || []).length === 0 ? <p className="muted small">Вторых страниц пока нет: люди закрывают сайт сразу или ещё не успели пройти дальше.</p> : (
          <ul>
            {view.flows.map((flow) => (
              <li key={`${flow.site}|${flow.from}|${flow.to}`}>
                <span>{pageInfo(flow.from, flow.site).title}{focus === 'all' ? ` · ${flow.site === 'pro' ? 'Pro' : 'Ru'}` : ''}</span>
                <i>дальше</i>
                <b>{pageInfo(flow.to, flow.site).title}</b>
                <strong className="mono-nums">{flow.visits}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PagesPane({ focus, view }) {
  const [sort, setSort] = useState('views');
  const [entriesOnly, setEntriesOnly] = useState(false);
  const [openKey, setOpenKey] = useState('');
  const rows = useMemo(() => {
    const list = (view.pages || []).filter((row) => !entriesOnly || row.entries > 0);
    list.sort((a, b) => (sort === 'entries' ? (b.entries || 0) - (a.entries || 0) : (b.views || 0) - (a.views || 0)));
    return list;
  }, [view.pages, sort, entriesOnly]);
  return (
    <div className="an-studio__pane">
      <div className="an-studio__tools">
        <p className="muted small">Нажмите строку, чтобы увидеть, откуда попали на страницу и куда ушли дальше.</p>
        <div className="an-traffic__metric-toggle">
          <button type="button" className={sort === 'views' ? 'is-on' : ''} onClick={() => setSort('views')}>По просмотрам</button>
          <button type="button" className={sort === 'entries' ? 'is-on' : ''} onClick={() => setSort('entries')}>По входу</button>
          <button type="button" className={entriesOnly ? 'is-on' : ''} onClick={() => setEntriesOnly((v) => !v)}>Только точки входа</button>
        </div>
      </div>
      {rows.length === 0 ? <p className="muted small">Страниц за этот период нет.</p> : (
        <div className="an-studio__table-wrap">
          <table className="an-studio__table">
            <thead>
              <tr>
                <th>Страница</th>
                {focus === 'all' && <th>Сайт</th>}
                <th>Просмотры</th>
                <th>Доля</th>
                <th>Начали здесь</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const info = pageInfo(row.path, row.site);
                const key = `${row.site}|${row.path}`;
                const open = openKey === key;
                const next = (view.flows || []).filter((flow) => flow.from === row.path && flow.site === row.site);
                return (
                  <Fragment key={key}>
                    <tr className={open ? 'is-open' : ''} onClick={() => setOpenKey(open ? '' : key)}>
                      <td>
                        <b>{info.title}</b>
                        <small>{info.note || info.path}</small>
                      </td>
                      {focus === 'all' && <td>{row.site === 'pro' ? 'Pro' : 'Ru'}</td>}
                      <td className="num mono-nums">{row.views}</td>
                      <td className="num">{share(row.views, view.views)}</td>
                      <td className="num mono-nums">{row.entries || 0}</td>
                    </tr>
                    {open && (
                      <tr className="an-studio__detail">
                        <td colSpan={focus === 'all' ? 5 : 4}>
                          <div className="an-studio__detail-grid">
                            <div>
                              <h4>Откуда начали эту страницу</h4>
                              {(row.sources || []).length === 0 ? (
                                <p className="muted small">{row.entries ? 'Источников для этой страницы пока нет.' : 'Эту страницу открывали уже внутри визита, не с первого экрана.'}</p>
                              ) : (
                                <ul className="an-studio__mini">
                                  {row.sources.map((src) => (
                                    <li key={`${src.group}|${src.host || src.label}`}>
                                      <span>{src.label}</span>
                                      <b className="mono-nums">{src.visits}</b>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <h4>Что открыли следом</h4>
                              {next.length === 0 ? <p className="muted small">Дальше с этой страницы пока не шли, либо она была не первой.</p> : (
                                <ul className="an-studio__mini">
                                  {next.map((flow) => (
                                    <li key={flow.to}>
                                      <span>{pageInfo(flow.to, flow.site).title}</span>
                                      <b className="mono-nums">{flow.visits}</b>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SourcesPane({ view }) {
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const groups = view.groups || {};
  const max = Math.max(1, ...GROUP_ORDER.map((key) => groups[key] || 0));
  const q = query.trim().toLowerCase();
  const list = (view.sources || []).filter((row) => (group === 'all' || row.group === group) && (!q || String(row.label).toLowerCase().includes(q) || String(row.host || '').toLowerCase().includes(q)));
  const topVisits = Math.max(1, ...list.map((row) => row.visits || 0));
  return (
    <div className="an-studio__pane">
      <p className="muted small">Источник считается по первому заходу визита. Список живёт только здесь, на общем экране аналитики его нет.</p>
      <div className="an-studio__groups">
        <button type="button" className={group === 'all' ? 'is-on' : ''} onClick={() => setGroup('all')}>
          <b>Все каналы</b>
          <strong className="mono-nums">{view.visits}</strong>
        </button>
        {GROUP_ORDER.map((key) => (
          <button key={key} type="button" className={group === key ? 'is-on' : ''} onClick={() => setGroup(key)}>
            <b>{GROUP_LABEL[key]}</b>
            <strong className="mono-nums">{groups[key] || 0}</strong>
            <small>{GROUP_HINT[key]}</small>
            <i><em style={{ width: `${Math.round(((groups[key] || 0) / max) * 100)}%` }} /></i>
          </button>
        ))}
      </div>
      <label className="an-studio__search">
        <span>Найти сайт</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, Яндекс или t.me" />
      </label>
      {list.length === 0 ? <p className="muted small">В этом канале за выбранные дни никого нет.</p> : (
        <ul className="an-studio__sources">
          {list.map((row) => (
            <li key={`${row.group}|${row.host || row.label}`}>
              <div>
                <b>{row.label}</b>
                <small>{row.hint}</small>
              </div>
              <div className="an-studio__source-num">
                <strong className="mono-nums">{row.visits}</strong>
                <span>{share(row.visits, view.visits)}</span>
              </div>
              <i><em style={{ width: `${Math.max(4, Math.round((row.visits / topVisits) * 100))}%` }} /></i>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimePane({ view, metric }) {
  const hours = view.hours || [];
  const week = (view.week || []).map((row, i) => ({ ...row, name: WEEKDAYS[row.dow ?? i] || WEEKDAYS[i] }));
  const hourMax = Math.max(1, ...hours.map((row) => row[metric] || 0));
  const best = peakHour(hours);
  return (
    <div className="an-studio__pane">
      <p className="muted small">
        {best?.visits ? `Пик первых заходов: ${String(best.hour).padStart(2, '0')}:00 по Москве.` : 'Когда появятся визиты, здесь будет час и день недели.'}
        {' '}Час и день считаются по Москве.
      </p>
      <h4>День недели</h4>
      <div className="an-studio__week">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={week} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, #333)" opacity={0.5} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload;
                return (
                  <div className="an-tt">
                    <div className="an-tt__label">{p.name}</div>
                    <div className="an-tt__val">{p.visits} {pluralRu(p.visits, 'визит', 'визита', 'визитов')}</div>
                    <div className="an-tt__sub">{p.views} просм.</div>
                  </div>
                );
              }}
            />
            <Bar dataKey={metric} fill="#c41e22" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h4>Час суток</h4>
      <div className="an-traffic__hour-bars">
        {hours.map((row) => (
          <div key={row.hour} title={`${String(row.hour).padStart(2, '0')}:00, визитов ${row.visits}, просмотров ${row.views}`}>
            <span className="an-traffic__hour-track"><i style={{ height: `${Math.round(((row[metric] || 0) / hourMax) * 100)}%` }} /></span>
            <span>{row.hour % 3 === 0 ? String(row.hour).padStart(2, '0') : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DaysPane({ series }) {
  const [picked, setPicked] = useState('');
  const rows = [...(series || [])].reverse();
  const best = rows.reduce((top, row) => {
    const n = (row.proVisits || 0) + (row.ruVisits || 0);
    return !top || n > top.n ? { date: row.date, n } : top;
  }, null);
  const day = rows.find((row) => row.date === picked);
  return (
    <div className="an-studio__pane">
      <p className="muted small">Нажмите день, чтобы увидеть Pro и Ru отдельно. Самый живой день в периоде подсвечен.</p>
      {day && (
        <div className="an-studio__daycard">
          <b>{humanDate(day.date)}</b>
          <span>Pro: {day.proVisits} {pluralRu(day.proVisits, 'визит', 'визита', 'визитов')}, {day.proViews} просм.</span>
          <span>Ru: {day.ruVisits} {pluralRu(day.ruVisits, 'визит', 'визита', 'визитов')}, {day.ruViews} просм.</span>
        </div>
      )}
      <div className="an-studio__table-wrap">
        <table className="an-studio__table">
          <thead>
            <tr>
              <th>День</th>
              <th>Pro, визиты</th>
              <th>Ru, визиты</th>
              <th>Pro, просмотры</th>
              <th>Ru, просмотры</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hot = best?.date === row.date && best.n > 0;
              return (
                <tr key={row.date} className={`${picked === row.date ? 'is-open' : ''} ${hot ? 'is-hot' : ''}`} onClick={() => setPicked(picked === row.date ? '' : row.date)}>
                  <td>{humanDateShort(row.date)}{hot ? ' · пик' : ''}</td>
                  <td className="num mono-nums">{row.proVisits}</td>
                  <td className="num mono-nums">{row.ruVisits}</td>
                  <td className="num mono-nums">{row.proViews}</td>
                  <td className="num mono-nums">{row.ruViews}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SiteTrafficBlock({ traffic, loading, error }) {
  const [focus, setFocus] = useState('all');
  const [metric, setMetric] = useState('visits');
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('summary');
  const sites = traffic?.sites;
  const series = traffic?.series || [];
  const pro = sites?.pro;
  const ru = sites?.ru;
  const view = viewOf(focus, sites);
  const lineKeys = focus === 'pro'
    ? [{ key: metric === 'views' ? 'proViews' : 'proVisits', name: 'Pro', color: '#c41e22' }]
    : focus === 'ru'
      ? [{ key: metric === 'views' ? 'ruViews' : 'ruVisits', name: 'Ru', color: '#c9a227' }]
      : metric === 'views'
        ? [{ key: 'proViews', name: 'Pro', color: '#c41e22' }, { key: 'ruViews', name: 'Ru', color: '#c9a227' }]
        : [{ key: 'proVisits', name: 'Pro', color: '#c41e22' }, { key: 'ruVisits', name: 'Ru', color: '#c9a227' }];
  const started = traffic?.startedOn ? humanDate(traffic.startedOn) : '';

  return (
    <section className="glass analytics-chart-card an-traffic">
      <div className="an-traffic__head">
        <div>
          <h3 className="analytics-h3">Посещаемость сайтов</h3>
          <p className="muted small an-h3-sub">
            Короткая сводка за период сверху.
            {started ? ` Считаем с ${started}.` : ''} Источники и подробный разбор открываются отдельно.
          </p>
        </div>
      </div>
      {error && <p className="analytics-err">{error}</p>}
      {loading && !sites && <p className="muted small">Считаем посещаемость…</p>}
      {sites && (
        <>
          <div className="an-traffic__tabs" role="tablist" aria-label="Какой сайт смотреть">
            {[
              ['all', 'Оба сайта', (pro?.visits || 0) + (ru?.visits || 0)],
              ['pro', 'reaktivo.pro', pro?.visits || 0],
              ['ru', 'reaktivo.ru', ru?.visits || 0],
            ].map(([id, label, count]) => (
              <button key={id} type="button" role="tab" aria-selected={focus === id} className={focus === id ? 'is-on' : ''} onClick={() => setFocus(id)}>
                <span>{label}</span>
                <b className="mono-nums">{count}</b>
              </button>
            ))}
          </div>
          <p className="an-traffic__read">{trafficReading(focus, view, traffic?.startedOn)}</p>
          <div className="an-traffic__kpis">
            <article>
              <span>Визиты</span>
              <b className="mono-nums">{view.visits}</b>
              <DeltaBadge d={delta(view.visits, view.prevVisits)} />
            </article>
            <article>
              <span>Просмотры</span>
              <b className="mono-nums">{view.views}</b>
              <DeltaBadge d={delta(view.views, view.prevViews)} />
            </article>
            <article>
              <span>Страниц за визит</span>
              <b className="mono-nums">{fmtDepth(view.views, view.visits)}</b>
            </article>
            <article>
              <span>Прошлый период</span>
              <b className="mono-nums">{view.prevVisits}</b>
              <small>визитов за такой же прошлый отрезок</small>
            </article>
          </div>
          <div className="an-traffic__chart-head">
            <h4>Динамика по дням</h4>
            <div className="an-traffic__legend">
              {lineKeys.map((line) => (
                <span key={line.key} className={`an-leg-pill an-leg-pill--${line.name === 'Ru' ? 'ru' : 'pro'}`}>{line.name}</span>
              ))}
            </div>
            <div className="an-traffic__metric-toggle">
              <button type="button" aria-pressed={metric === 'visits'} className={metric === 'visits' ? 'is-on' : ''} onClick={() => setMetric('visits')}>Визиты</button>
              <button type="button" aria-pressed={metric === 'views'} className={metric === 'views' ? 'is-on' : ''} onClick={() => setMetric('views')}>Просмотры</button>
            </div>
          </div>
          <TrafficChart series={series} metric={metric} lineKeys={lineKeys} />
          <button type="button" className="an-traffic__open" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Свернуть разбор' : 'Разобрать подробно'}
          </button>
          {open && (
            <div className="an-studio">
              <div className="an-studio__nav" role="tablist" aria-label="Разделы разбора">
                {SECTIONS.map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? 'is-on' : ''} onClick={() => setSection(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {section === 'summary' && <SummaryPane focus={focus} view={view} pro={pro} ru={ru} onSite={setFocus} />}
              {section === 'pages' && <PagesPane key={focus} focus={focus} view={view} />}
              {section === 'sources' && <SourcesPane key={`${focus}|sources`} view={view} />}
              {section === 'time' && <TimePane view={view} metric={metric} />}
              {section === 'days' && <DaysPane series={series} />}
            </div>
          )}
        </>
      )}
    </section>
  );
}
