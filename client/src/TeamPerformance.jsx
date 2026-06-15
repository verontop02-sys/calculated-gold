import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api } from './api.js';
import { isUserManagerRole, roleLabel } from './roles.js';
import { SkeletonStats, SkeletonChart, SkeletonTable } from './Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';
import { PageHint } from './PageHint.jsx';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toIso(d) {
  if (!d) return '';
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return t.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, m) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}

function fmtRuDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

const WEEK_BAR = {
  up: 'var(--emerald-strong, #3d9a6a)',
  down: 'var(--crimson, #c96a4a)',
  neu: 'var(--accent, #8b7cff)',
};

function WeekDeltaCell({ deltaPct }) {
  if (deltaPct == null) return <span className="muted">—</span>;
  const sign = deltaPct > 0 ? '+' : '';
  const cls =
    deltaPct > 0.5
      ? 'team-week-delta team-week-delta--up'
      : deltaPct < -0.5
        ? 'team-week-delta team-week-delta--down'
        : 'team-week-delta team-week-delta--flat';
  return (
    <span className={`mono-nums ${cls}`}>
      {sign}
      {deltaPct}%
    </span>
  );
}

export function TeamPerformance({ formatMoney, toast, user }) {
  const isManager = isUserManagerRole(user?.role);
  const today = toIso(new Date());
  const [to, setTo] = useState(today);
  const [from, setFrom] = useState(() => addDays(today, -30));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [staff, setStaff] = useState([]);
  const [staffErr, setStaffErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const ids = [...selectedIds];
      const d = await api.teamPerformance(from, to, ids.length > 0 ? ids : undefined);
      setData(d);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedIds]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isManager) {
      setStaff([]);
      return;
    }
    let alive = true;
    api
      .users()
      .then((rows) => {
        if (!alive) return;
        setStaff(Array.isArray(rows) ? rows : []);
        setStaffErr('');
      })
      .catch((e) => {
        if (!alive) return;
        setStaffErr(e?.message || 'Нет списка пользователей');
        setStaff([]);
      });
    return () => {
      alive = false;
    };
  }, [isManager]);

  function applyPreset(preset) {
    const t = toIso(new Date());
    if (preset === '7d') {
      setTo(t);
      setFrom(addDays(t, -7));
    } else if (preset === '30d') {
      setTo(t);
      setFrom(addDays(t, -30));
    } else if (preset === '90d') {
      setTo(t);
      setFrom(addDays(t, -90));
    } else if (preset === 'ytd') {
      const y = new Date();
      setTo(t);
      setFrom(`${y.getFullYear()}-01-01`);
    } else if (preset === 'month') {
      setTo(t);
      setFrom(addMonths(t, -1));
    }
  }

  function toggleOperator(uid) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function clearOperatorFilter() {
    setSelectedIds(new Set());
  }

  async function exportPdf() {
    setPdfBusy(true);
    try {
      const ids = [...selectedIds];
      const blob = await api.teamPerformancePdf(from, to, ids.length > 0 ? ids : undefined);
      const pf = String(from || '').replace(/[^\d-]/g, '') || 'from';
      const pt = String(to || '').replace(/[^\d-]/g, '') || 'to';
      downloadBlob(blob, `komanda-kpi-${pf}_${pt}.pdf`);
      toast?.('PDF скачан — можно отправить в архив или распечатать', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось сформировать PDF', 'error');
    } finally {
      setPdfBusy(false);
    }
  }

  const totals = data?.totals;
  const thresholds = data?.thresholds;
  const periodLabel = data?.period ? `${fmtRuDate(data.period.from)} — ${fmtRuDate(data.period.to)}` : '';

  const chartSeries = useMemo(() => {
    const rows = data?.dailyRows;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const m = new Map();
    for (const r of rows) {
      const day = r.day;
      if (!day) continue;
      m.set(day, (m.get(day) || 0) + (Number(r.sumRub) || 0));
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, sumRub]) => ({ x: day.slice(5), sumRub, day }));
  }, [data]);

  const weekSeries = useMemo(() => {
    const w = data?.byWeek;
    if (!Array.isArray(w) || w.length === 0) return [];
    return w.map((row, i) => {
      const prev = i > 0 ? w[i - 1] : null;
      const cur = Number(row.sumRub) || 0;
      const prevSum = prev ? Number(prev.sumRub) || 0 : null;
      let deltaPct = null;
      let barTone = 'neu';
      if (prev) {
        if (prevSum > 0) {
          deltaPct = Math.round(((cur - prevSum) / prevSum) * 1000) / 10;
          if (deltaPct > 0.5) barTone = 'up';
          else if (deltaPct < -0.5) barTone = 'down';
        } else if (cur > 0) {
          barTone = 'up';
        }
      }
      return {
        label: fmtRuDate(row.weekStart),
        sumRub: cur,
        deals: row.deals,
        deltaPct,
        barTone,
        weekStart: row.weekStart,
        weightGrossSum: row.weightGrossSum,
        weightNetSum: row.weightNetSum,
      };
    });
  }, [data?.byWeek]);

  const hasRows = data?.operators && data.operators.length > 0;
  const PRESETS = [
    { id: '7d', label: '7 дней' },
    { id: '30d', label: '30 дней' },
    { id: '90d', label: '90 дней' },
    { id: 'month', label: 'Месяц' },
    { id: 'ytd', label: 'С 1 янв.' },
  ];

  return (
    <div className="tm-page">
      <PageHint id="team" title="Команда и KPI">
        Сделка засчитывается сотруднику, который скачал PDF договора. Выберите период и при необходимости отметьте конкретных людей. Рейтинг — по обороту, цвет строк задаёт зона мотивации.
      </PageHint>
      {/* ── Шапка ── */}
      <header className="tm-head tm-in" style={{ '--d': '0ms' }}>
        <div className="tm-head__top">
          <div className="tm-head__titles">
            <span className="tm-kicker">REAKTIVO PRO · команда</span>
            <h2 className="tm-title">Команда и KPI</h2>
            <p className="tm-subtitle">
              Кто сколько оформил договоров и на какую сумму за период — на одном экране для руководителя и сотрудника.
            </p>
          </div>
          <span className={`tm-mode${isManager ? ' tm-mode--mgr' : ''}`}>
            <span className="tm-mode__dot" aria-hidden />
            {isManager ? 'Руководитель · вся команда' : 'Только мои сделки'}
          </span>
        </div>

        {/* Период */}
        <div className="tm-presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="tm-pill" onClick={() => applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="tm-toolbar">
          <label className="tm-date">
            <span className="tm-date__label">С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="tm-date">
            <span className="tm-date__label">По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="tm-btn tm-btn--ghost" onClick={load} disabled={loading}>
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--accent"
            onClick={exportPdf}
            disabled={loading || pdfBusy || !totals || totals.deals === 0}
            title={totals?.deals === 0 ? 'Нет сделок за период' : 'Таблица и KPI в PDF'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 16V4"/></svg>
            {pdfBusy ? 'Формируем…' : 'Выгрузить PDF'}
          </button>
        </div>
      </header>

      {/* ── Фильтр сотрудников (руководитель) ── */}
      {isManager && (
        <section className="tm-card tm-in" style={{ '--d': '60ms' }}>
          <div className="tm-card__head">
            <h3 className="tm-card__title">Фильтр сотрудников</h3>
            {selectedIds.size > 0 && (
              <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={clearOperatorFilter}>
                Показать всех
              </button>
            )}
          </div>
          {staffErr && <p className="tm-muted">{staffErr}</p>}
          {!staffErr && staff.length > 0 && (
            <div className="tm-staff">
              {staff.map((u) => {
                const on = selectedIds.has(u.uid);
                return (
                  <button
                    key={u.uid}
                    type="button"
                    className={`tm-staff__chip${on ? ' tm-staff__chip--on' : ''}`}
                    onClick={() => toggleOperator(u.uid)}
                  >
                    <span className={`tm-staff__check${on ? ' tm-staff__check--on' : ''}`} aria-hidden>
                      {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                    <span className="tm-staff__text">
                      <span className="tm-staff__email">{u.email}</span>
                      <span className="tm-staff__role">{roleLabel(u.role)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="tm-hint">Никого не отмечено — в отчёт попадают все. Отметьте конкретных, чтобы смотреть только их вклад.</p>
        </section>
      )}

      {err && <div className="tm-err tm-in">{err}</div>}

      {loading && !totals && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonStats count={3} />
          <SkeletonChart height={220} />
          <SkeletonTable rows={4} cols={5} />
        </div>
      )}

      {/* ── KPI ── */}
      {totals && !loading && (
        <section className="tm-kpis tm-in" style={{ '--d': '120ms' }} aria-label="Ключевые показатели">
          <article className="tm-kpi" style={{ '--i': 0 }}>
            <span className="tm-kpi__chip tm-kpi__chip--accent" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>
            </span>
            <span className="tm-kpi__label">Сделок</span>
            <span className="tm-kpi__value mono-nums">{totals.deals}</span>
            <span className="tm-kpi__hint">договоров с PDF</span>
          </article>
          <article className="tm-kpi tm-kpi--accent" style={{ '--i': 1 }}>
            <span className="tm-kpi__chip tm-kpi__chip--accent" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            <span className="tm-kpi__label">Оборот</span>
            <span className="tm-kpi__value mono-nums">{formatMoney(totals.sumRub)}</span>
            <span className="tm-kpi__hint">сумма по сделкам</span>
          </article>
          <article className="tm-kpi" style={{ '--i': 2 }}>
            <span className="tm-kpi__chip tm-kpi__chip--emerald" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h12"/></svg>
            </span>
            <span className="tm-kpi__label">Вес 1-й строки</span>
            <span className="tm-kpi__value tm-kpi__value--sm mono-nums">
              {(totals.weightGrossSum ?? 0).toFixed(2)} / {(totals.weightNetSum ?? 0).toFixed(3)} г
            </span>
            <span className="tm-kpi__hint">лом / чистый</span>
          </article>
          {periodLabel && <p className="tm-period">Период: {periodLabel}</p>}
        </section>
      )}

      {totals && !loading && totals.deals === 0 && (
        <EmptyState
          icon="users"
          title="За этот период сделок нет"
          description="Когда сотрудники скачают PDF по договорам, здесь появятся цифры. Проверьте даты или расширьте период."
        />
      )}

      {/* ── Рейтинг ── */}
      {hasRows && !loading && (
        <section className="tm-card tm-in" style={{ '--d': '180ms' }}>
          <div className="tm-card__head">
            <div>
              <h3 className="tm-card__title">Рейтинг по обороту</h3>
              <p className="tm-card__sub">Сортировка по сумме · доля от оборота в этом отчёте</p>
            </div>
          </div>
          <div className="tm-rank">
            {data.operators.map((row) => (
              <div key={row.operatorId == null ? 'none' : String(row.operatorId)} className={`tm-rank__row tm-rank__row--${row.tier}`}>
                <span className={`tm-rank__badge tm-rank__badge--${row.rank <= 3 ? row.rank : 'n'}`}>
                  {row.rank <= 3 ? rankBadge(row.rank) : row.rank}
                </span>
                <div className="tm-rank__main">
                  <span className="tm-rank__email">{row.email || '—'}</span>
                  <div className="tm-rank__meta">
                    <span>{row.deals} сд.</span>
                    <span>{(row.weightGrossSum ?? 0).toFixed(2)} / {(row.weightNetSum ?? 0).toFixed(3)} г</span>
                  </div>
                </div>
                <div className="tm-rank__right">
                  <span className="tm-rank__sum mono-nums">{formatMoney(row.sumRub)}</span>
                  <div className="tm-rank__share">
                    <div className="tm-rank__share-bar"><div className="tm-rank__share-fill" style={{ width: `${Math.min(100, row.shareRubPct)}%` }} /></div>
                    <span className="tm-rank__share-pct">{row.shareRubPct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── График по дням ── */}
      {chartSeries.length > 0 && totals && (
        <section className="tm-card tm-in" style={{ '--d': '240ms' }}>
          <h3 className="tm-card__title">Динамика оборота по дням</h3>
          <p className="tm-card__sub">Сумма в ₽ по календарным дням в рамках фильтра</p>
          <div className="tm-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="tmAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                    <stop offset="65%" stopColor="var(--accent)" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 7" stroke="var(--stroke-soft)" vertical={false} />
                <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--stroke-soft)', borderRadius: 12, boxShadow: 'var(--shadow-pop)' }}
                  formatter={(v) => [v != null ? formatMoney(v) : '', 'Оборот']}
                  labelFormatter={(l) => `Дата ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="sumRub"
                  name="Оборот"
                  stroke="var(--accent)"
                  strokeWidth={2.6}
                  fill="url(#tmAreaGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: 'var(--accent)' }}
                  animationDuration={1300}
                  animationEasing="ease"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── По неделям ── */}
      {weekSeries.length > 0 && totals && (
        <section className="tm-card tm-in" style={{ '--d': '300ms' }}>
          <h3 className="tm-card__title">Сводка по неделям</h3>
          <p className="tm-card__sub">
            Столбцы — оборот за неделю; цвет к предыдущей неделе (зелёный выше, красный ниже).
          </p>
          <div className="tm-chart-h tm-chart-h--week">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekSeries} margin={{ top: 8, right: 8, left: 4, bottom: weekSeries.length > 6 ? 20 : 6 }}>
                <CartesianGrid strokeDasharray="3 7" stroke="var(--stroke-soft)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={weekSeries.length > 6 ? -22 : 0}
                  textAnchor={weekSeries.length > 6 ? 'end' : 'middle'}
                  height={weekSeries.length > 6 ? 52 : 30}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                <Tooltip
                  cursor={{ fill: 'var(--accent-soft)' }}
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--stroke-soft)', borderRadius: 12, boxShadow: 'var(--shadow-pop)' }}
                  labelFormatter={(label) => `Неделя с ${label}`}
                  formatter={(value, _name, item) => {
                    const pl = item?.payload;
                    if (!pl) return formatMoney(value);
                    const d = pl.deltaPct;
                    const tail = d == null ? '' : ` · к пред.: ${d > 0 ? '+' : ''}${d}%`;
                    return [`${formatMoney(value)}${tail}`, 'Оборот'];
                  }}
                />
                <Bar dataKey="sumRub" name="Оборот" radius={[6, 6, 0, 0]} animationDuration={1100} animationEasing="ease">
                  {weekSeries.map((entry, i) => (
                    <Cell key={entry.weekStart || i} fill={WEEK_BAR[entry.barTone] || WEEK_BAR.neu} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="tm-week-list">
            {weekSeries.map((w) => (
              <div key={w.weekStart} className="tm-week">
                <span className="tm-week__date">{w.label}</span>
                <span className="tm-week__sum mono-nums">{formatMoney(w.sumRub)}</span>
                <WeekDeltaCell deltaPct={w.deltaPct} />
                <span className="tm-week__deals">{w.deals} сд.</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Мотивация (упрощённый блок) ── */}
      {isManager && thresholds && totals && !loading && (
        <section className="tm-card tm-in" style={{ '--d': '360ms' }}>
          <h3 className="tm-card__title">Мотивация · зоны подсветки</h3>
          <p className="tm-card__sub">Пороги задают только цвет строк рейтинга. Автоначислений нет.</p>
          <div className="tm-tiers">
            <div className="tm-tier tm-tier--high">
              <span className="tm-tier__dot" />
              <div>
                <div className="tm-tier__name">Высокая зона</div>
                <div className="tm-tier__val">от {formatMoney(thresholds.highSumRub)}</div>
              </div>
            </div>
            <div className="tm-tier tm-tier--mid">
              <span className="tm-tier__dot" />
              <div>
                <div className="tm-tier__name">Средняя зона</div>
                <div className="tm-tier__val">от {formatMoney(thresholds.midSumRub)}</div>
              </div>
            </div>
            <div className="tm-tier tm-tier--low">
              <span className="tm-tier__dot" />
              <div>
                <div className="tm-tier__name">Базовая зона</div>
                <div className="tm-tier__val">ниже порога</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <style>{`
        .tm-page { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; min-width: 0; }

        /* Entrance — только opacity + transform (GPU, без репейнтов) */
        .tm-in {
          animation: tmIn 440ms cubic-bezier(0.22,1,0.36,1) both;
          animation-delay: var(--d, 0ms);
          will-change: transform, opacity;
        }
        @keyframes tmIn {
          from { opacity: 0; transform: translate3d(0, 14px, 0); }
          to { opacity: 1; transform: translate3d(0,0,0); }
        }

        /* Card base */
        .tm-card {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 18px;
          padding: 20px;
          min-width: 0;
        }
        .tm-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .tm-card__title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; margin: 0; letter-spacing: -0.01em; color: var(--text-strong); }
        .tm-card__sub { margin: 4px 0 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; }
        .tm-muted { font-size: 0.82rem; color: var(--text-muted); }
        .tm-hint { margin: 12px 0 0; font-size: 0.76rem; color: var(--text-dim); line-height: 1.5; }
        .tm-hint code { font-family: ui-monospace, monospace; font-size: 0.72rem; color: var(--accent); background: var(--accent-soft); padding: 1px 6px; border-radius: 5px; }

        /* Head */
        .tm-head {
          background: var(--bg-panel-solid);
          border: 1px solid var(--stroke-soft);
          border-radius: 20px;
          padding: 22px 22px 18px;
          display: flex; flex-direction: column; gap: 16px;
          position: relative; overflow: hidden;
        }
        .tm-head::before {
          content: ''; position: absolute; top: -120px; right: -60px;
          width: 320px; height: 280px; border-radius: 50%;
          background: radial-gradient(ellipse at center, var(--accent-soft), transparent 70%);
          filter: blur(50px); pointer-events: none; z-index: 0;
        }
        .tm-head__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; position: relative; z-index: 1; }
        .tm-kicker { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent); font-weight: 700; }
        .tm-title { font-family: var(--font-display); font-size: clamp(1.4rem, 1.1rem + 1.4vw, 2rem); font-weight: 700; margin: 6px 0 6px; letter-spacing: -0.02em; color: var(--text-strong); }
        .tm-subtitle { margin: 0; font-size: 0.88rem; line-height: 1.5; color: var(--text-muted); max-width: 54ch; }
        .tm-mode {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px;
          font-size: 0.74rem; padding: 8px 14px; border-radius: 999px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          color: var(--text-muted); font-weight: 600;
        }
        .tm-mode__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-dim); }
        .tm-mode--mgr { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
        .tm-mode--mgr .tm-mode__dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }

        /* Presets */
        .tm-presets { display: flex; flex-wrap: wrap; gap: 6px; position: relative; z-index: 1; }
        .tm-pill {
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          color: var(--text-muted); font-size: 0.78rem; font-weight: 600;
          padding: 7px 14px; border-radius: 10px; cursor: pointer;
          transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .tm-pill:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); transform: translateY(-1px); }

        /* Toolbar */
        .tm-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; position: relative; z-index: 1; }
        .tm-date { display: flex; flex-direction: column; gap: 5px; }
        .tm-date__label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 600; }
        .tm-date input {
          padding: 9px 12px; border-radius: 10px; border: 1px solid var(--stroke-soft);
          background: var(--bg-elevated); color: var(--text); font-family: inherit; font-size: 0.86rem;
          min-width: 9rem; transition: border-color 180ms, box-shadow 180ms;
        }
        .tm-date input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
        .tm-btn {
          display: inline-flex; align-items: center; gap: 7px; justify-content: center;
          padding: 10px 16px; border-radius: 10px; font-size: 0.85rem; font-weight: 600;
          cursor: pointer; border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          color: var(--text); transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .tm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .tm-btn--ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .tm-btn--accent { background: var(--accent-grad); border-color: transparent; color: #fff; box-shadow: 0 4px 16px var(--accent-glow); }
        .tm-btn--accent:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 22px var(--accent-glow); }
        .tm-btn--sm { padding: 6px 12px; font-size: 0.78rem; }

        /* Staff filter */
        .tm-staff { display: flex; flex-wrap: wrap; gap: 8px; }
        .tm-staff__chip {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 14px 9px 10px; border-radius: 12px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          cursor: pointer; transition: all 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .tm-staff__chip:hover { border-color: var(--accent); transform: translateY(-1px); }
        .tm-staff__chip--on { border-color: var(--accent); background: var(--accent-soft); }
        .tm-staff__check {
          width: 18px; height: 18px; border-radius: 6px; flex-shrink: 0;
          border: 1.5px solid var(--stroke-strong); background: transparent;
          display: flex; align-items: center; justify-content: center; color: #fff;
          transition: all 160ms;
        }
        .tm-staff__check--on { background: var(--accent); border-color: var(--accent); }
        .tm-staff__text { display: flex; flex-direction: column; gap: 1px; text-align: left; min-width: 0; }
        .tm-staff__email { font-size: 0.84rem; font-weight: 600; color: var(--text); }
        .tm-staff__role { font-size: 0.7rem; color: var(--text-muted); }

        /* Error */
        .tm-err {
          background: var(--crimson-soft); border: 1px solid var(--crimson);
          color: var(--crimson); border-radius: 14px; padding: 14px 16px; font-size: 0.86rem;
        }

        /* KPI */
        .tm-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; position: relative; }
        .tm-kpi {
          position: relative; overflow: hidden;
          padding: 18px 18px 16px; border-radius: 16px;
          border: 1px solid var(--stroke-soft); background: var(--bg-panel-solid);
          display: flex; flex-direction: column; gap: 0;
          animation: tmIn 440ms cubic-bezier(0.22,1,0.36,1) both;
          animation-delay: calc(var(--i, 0) * 60ms + 120ms);
          transition: transform 240ms cubic-bezier(0.22,1,0.36,1), box-shadow 240ms;
        }
        .tm-kpi:hover { transform: translateY(-3px); box-shadow: var(--shadow-pop); }
        .tm-kpi--accent { background: linear-gradient(145deg, var(--accent-soft), var(--bg-panel-solid) 65%); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
        .tm-kpi__chip {
          width: 38px; height: 38px; border-radius: 11px; margin-bottom: 12px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .tm-kpi__chip--accent { background: var(--accent-soft); color: var(--accent); }
        .tm-kpi__chip--emerald { background: var(--emerald-soft); color: var(--emerald); }
        .tm-kpi__label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 600; }
        .tm-kpi__value { font-size: clamp(1.3rem, 1.1rem + 1vw, 1.7rem); font-weight: 800; color: var(--text-strong); letter-spacing: -0.03em; line-height: 1.1; margin-top: 4px; font-family: var(--font-display); }
        .tm-kpi--accent .tm-kpi__value { color: var(--accent); }
        .tm-kpi__value--sm { font-size: clamp(0.95rem, 0.85rem + 0.6vw, 1.2rem); }
        .tm-kpi__hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 6px; }
        .tm-period { grid-column: 1 / -1; margin: 2px 0 0; font-size: 0.78rem; color: var(--text-muted); }
        @media (max-width: 760px) { .tm-kpis { grid-template-columns: 1fr; } }

        /* Rank list */
        .tm-rank { display: flex; flex-direction: column; gap: 8px; }
        .tm-rank__row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
          transition: box-shadow 200ms, transform 200ms;
        }
        .tm-rank__row:hover { box-shadow: var(--shadow-pop); transform: translateX(2px); }
        .tm-rank__row--high { border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
        .tm-rank__badge {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.9rem; font-weight: 700; font-family: var(--font-display);
          background: var(--surface); color: var(--text-muted);
        }
        .tm-rank__badge--1 { background: linear-gradient(135deg, #ffd86b, #f5a623); color: #5a3d00; font-size: 1.1rem; }
        .tm-rank__badge--2 { background: linear-gradient(135deg, #e2e8f0, #b9c2cf); color: #3a3f47; font-size: 1.1rem; }
        .tm-rank__badge--3 { background: linear-gradient(135deg, #f0b27a, #d98841); color: #4a2c0a; font-size: 1.1rem; }
        .tm-rank__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .tm-rank__email { font-size: 0.88rem; font-weight: 600; color: var(--text); word-break: break-word; }
        .tm-rank__meta { display: flex; gap: 10px; font-size: 0.74rem; color: var(--text-muted); flex-wrap: wrap; }
        .tm-rank__right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; min-width: 120px; }
        .tm-rank__sum { font-size: 0.95rem; font-weight: 700; color: var(--text-strong); font-family: var(--font-display); }
        .tm-rank__share { display: flex; align-items: center; gap: 7px; width: 100%; }
        .tm-rank__share-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--surface); overflow: hidden; }
        .tm-rank__share-fill { height: 100%; border-radius: 999px; background: var(--accent-grad); }
        .tm-rank__share-pct { font-size: 0.72rem; color: var(--text-muted); min-width: 32px; text-align: right; }
        @media (max-width: 560px) {
          .tm-rank__row { flex-wrap: wrap; }
          .tm-rank__right { width: 100%; align-items: stretch; min-width: 0; }
          .tm-rank__share { width: 100%; }
        }

        /* Charts */
        .tm-chart-h { width: 100%; min-width: 0; height: 240px; margin-top: 12px; }
        .tm-chart-h--week { height: 220px; }

        /* Week list */
        .tm-week-list { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
        .tm-week {
          display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 12px;
          padding: 9px 12px; border-radius: 10px; border-bottom: 1px solid var(--stroke-soft);
        }
        .tm-week:hover { background: var(--surface); }
        .tm-week__date { font-size: 0.82rem; color: var(--text-muted); }
        .tm-week__sum { font-size: 0.88rem; font-weight: 700; color: var(--text-strong); }
        .tm-week__deals { font-size: 0.76rem; color: var(--text-muted); min-width: 48px; text-align: right; }
        .team-week-delta { font-weight: 600; font-size: 0.8rem; min-width: 52px; text-align: right; }
        .team-week-delta--up { color: var(--emerald); }
        .team-week-delta--down { color: var(--crimson); }
        .team-week-delta--flat { color: var(--text-muted); }

        /* Motivation tiers */
        .tm-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .tm-tier {
          display: flex; align-items: center; gap: 10px;
          padding: 14px; border-radius: 14px;
          border: 1px solid var(--stroke-soft); background: var(--bg-elevated);
        }
        .tm-tier__dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .tm-tier--high .tm-tier__dot { background: var(--accent); box-shadow: 0 0 10px var(--accent-glow); }
        .tm-tier--mid .tm-tier__dot { background: var(--text-muted); }
        .tm-tier--low .tm-tier__dot { background: var(--text-dim); }
        .tm-tier__name { font-size: 0.8rem; font-weight: 600; color: var(--text); }
        .tm-tier__val { font-size: 0.76rem; color: var(--text-muted); margin-top: 2px; }
        @media (max-width: 560px) { .tm-tiers { grid-template-columns: 1fr; } }

        @media (max-width: 600px) {
          .tm-head { padding: 18px 16px 14px; }
          .tm-toolbar .tm-btn { flex: 1; }
          .tm-date { flex: 1; }
          .tm-date input { min-width: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
