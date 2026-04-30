import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

function tierClass(tier) {
  if (tier === 'high') return 'team-tier-high';
  if (tier === 'mid') return 'team-tier-mid';
  return 'team-tier-low';
}

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

const WEEK_BAR = {
  up: '#3d9a6a',
  down: '#c96a4a',
  neu: '#b8860b',
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

  return (
    <div className="team-page">
      <header className="team-hero glass">
        <div className="team-hero-top">
          <div>
            <p className="team-kicker">REAKTIVO PRO · учёт сделок</p>
            <h2 className="team-title">Панель команды и KPI</h2>
            <p className="team-subtitle">
              Цифры по выкупу лома: кто сколько оформил договоров и на какую сумму за период. Один экран — чтобы было
              понятно и руководителю, и сотруднику.
            </p>
          </div>
          <span className={`team-mode-badge ${isManager ? 'team-mode-badge--mgr' : ''}`}>
            {isManager ? 'Руководитель · видно всю команду' : 'Личный кабинет · только ваши сделки'}
          </span>
        </div>

        <aside className="team-rules" aria-label="Правила расчёта">
          <h3 className="team-rules-title">Как считается</h3>
          <ol className="team-rules-list">
            <li>
              <strong>Сделка</strong> попадает в отчёт, когда по договору-квитанции нажали «Скачать PDF». Без PDF сделки в
              статистике нет.
            </li>
            <li>
              <strong>Сотрудник</strong> — учётная запись того, кто скачал PDF (e-mail в таблице ниже).
            </li>
            <li>
              <strong>Вес</strong> — по первой заполненной строке таблицы в договоре (лом / чистая масса), как в
              аналитике.
            </li>
            <li>
              <strong>Доля суммы</strong> — доля оборота сотрудника в общем обороте по выбранному фильтру (не налоговая
              база).
            </li>
          </ol>
          {isManager && thresholds && (
            <div className="team-tier-legend">
              <span className="team-rules-title" style={{ marginBottom: 8, display: 'block' }}>
                Подсветка строк (мотивация)
              </span>
              <div className="team-tier-chips">
                <span className="team-chip team-chip-high">Высокая зона — от {formatMoney(thresholds.highSumRub)}</span>
                <span className="team-chip team-chip-mid">Средняя — от {formatMoney(thresholds.midSumRub)}</span>
                <span className="team-chip team-chip-low">Ниже порога — базовая зона</span>
              </div>
              <p className="muted small team-rules-note">
                Подсветка строк — не «KPI плана», а пороги для цвета на экране: переменные окружения на сервере{' '}
                <span className="team-env-name">TEAM_PERF_HIGH_SUM_RUB</span> и{' '}
                <span className="team-env-name">TEAM_PERF_MID_SUM_RUB</span> (в т.ч. Render → Environment). После
                смены значений перезапустите бэкенд. Автоначислений нет.
              </p>
            </div>
          )}
        </aside>

        <div className="analytics-presets">
          <span className="muted small">Период:</span>
          <button type="button" className="an-pill" onClick={() => applyPreset('7d')}>
            7 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('30d')}>
            30 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('90d')}>
            90 дн
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('ytd')}>
            С 1 янв.
          </button>
          <button type="button" className="an-pill" onClick={() => applyPreset('month')}>
            1 мес назад
          </button>
        </div>
        <div className="analytics-filters team-toolbar">
          <label className="field field-inline">
            <span className="field-label">С</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field field-inline">
            <span className="field-label">По</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? 'Загрузка…' : 'Обновить данные'}
          </button>
          <button
            type="button"
            className="btn-secondary team-btn-pdf"
            onClick={exportPdf}
            disabled={loading || pdfBusy || !totals || totals.deals === 0}
            title={totals?.deals === 0 ? 'Нет сделок за период' : 'Таблица и KPI в PDF'}
          >
            {pdfBusy ? 'Формируем PDF…' : 'Выгрузить PDF'}
          </button>
        </div>

        {isManager && (
          <div className="glass team-filter-block">
            <div className="team-filter-head">
              <span className="team-filter-title">Фильтр сотрудников</span>
              <button type="button" className="btn-ghost small" onClick={clearOperatorFilter}>
                Показать всех
              </button>
            </div>
            {staffErr && <p className="muted small">{staffErr}</p>}
            {!staffErr && staff.length > 0 && (
              <ul className="team-filter-list">
                {staff.map((u) => (
                  <li key={u.uid}>
                    <label className="team-filter-row">
                      <input
                        type="checkbox"
                        className="team-filter-cb"
                        checked={selectedIds.has(u.uid)}
                        onChange={() => toggleOperator(u.uid)}
                      />
                      <span className="team-filter-text">
                        <span className="team-filter-email">{u.email}</span>
                        <span className="team-filter-role">{roleLabel(u.role)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small team-filter-hint">
              Не отмечайте никого — в отчёт попадают все. Отметьте конкретных людей, чтобы смотреть только их вклад.
            </p>
          </div>
        )}
      </header>

      {err && <div className="glass analytics-err">{err}</div>}

      {loading && !totals && (
        <div className="glass team-skeleton">
          <p className="muted">Загружаем KPI…</p>
        </div>
      )}

      {totals && !loading && (
        <>
          <p className="team-period-line muted small">{periodLabel ? `Период в отчёте: ${periodLabel}` : ''}</p>
          <section className="team-kpi-section" aria-label="Ключевые показатели">
            <h3 className="team-section-title">Ключевые показатели за период</h3>
            <div className="team-kpi-grid">
              <article className="team-kpi-card">
                <span className="team-kpi-icon" aria-hidden>
                  ◆
                </span>
                <span className="team-kpi-label">Сделок</span>
                <span className="team-kpi-value mono-nums">{totals.deals}</span>
                <span className="team-kpi-hint muted">договоров с выгруженным PDF</span>
              </article>
              <article className="team-kpi-card team-kpi-card--accent">
                <span className="team-kpi-icon" aria-hidden>
                  ₽
                </span>
                <span className="team-kpi-label">Оборот</span>
                <span className="team-kpi-value mono-nums">{formatMoney(totals.sumRub)}</span>
                <span className="team-kpi-hint muted">сумма по выбранным сделкам</span>
              </article>
              <article className="team-kpi-card">
                <span className="team-kpi-icon" aria-hidden>
                  ⚖
                </span>
                <span className="team-kpi-label">Вес 1-й строки</span>
                <span className="team-kpi-value mono-nums small-digits">
                  {(totals.weightGrossSum ?? 0).toFixed(2)} / {(totals.weightNetSum ?? 0).toFixed(3)} г
                </span>
                <span className="team-kpi-hint muted">лом / чистый — как в договоре</span>
              </article>
            </div>
          </section>
        </>
      )}

      {totals && !loading && totals.deals === 0 && (
        <div className="glass team-empty">
          <p className="team-empty-title">За этот период пока нет сделок</p>
          <p className="muted small">
            Когда сотрудники скачают PDF по договорам, здесь появятся цифры. Проверьте даты или расширьте период.
          </p>
        </div>
      )}

      {hasRows && !loading && (
        <section className="glass team-table-card">
          <div className="team-table-head">
            <h3 className="analytics-h3 team-table-title">Рейтинг по обороту</h3>
            <p className="muted small team-table-desc">
              Сортировка по сумме (выше — больше выручка по договорам за период). Доля — от оборота в этом отчёте.
            </p>
          </div>
          <div className="analytics-op-table-wrap">
            <table className="analytics-op-table team-table">
              <thead>
                <tr>
                  <th className="mono-nums">Место</th>
                  <th>Сотрудник</th>
                  <th className="mono-nums">Сделок</th>
                  <th className="mono-nums">Оборот</th>
                  <th className="mono-nums">Вес лом / чист., г</th>
                  <th className="mono-nums">Доля</th>
                </tr>
              </thead>
              <tbody>
                {data.operators.map((row) => (
                  <tr key={row.operatorId == null ? 'none' : String(row.operatorId)}>
                    <td className="mono-nums team-rank-cell">{rankBadge(row.rank)}</td>
                    <td>
                      <span className={tierClass(row.tier)}>{row.email || '—'}</span>
                    </td>
                    <td className="mono-nums">{row.deals}</td>
                    <td className="mono-nums">{formatMoney(row.sumRub)}</td>
                    <td className="mono-nums small-digits">
                      {(row.weightGrossSum ?? 0).toFixed(2)} / {(row.weightNetSum ?? 0).toFixed(3)}
                    </td>
                    <td className="mono-nums">{row.shareRubPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {chartSeries.length > 0 && !loading && (
        <section className="glass analytics-chart-card team-chart-card">
          <h3 className="analytics-h3">Динамика оборота по дням</h3>
          <p className="muted small an-h3-sub">Сумма в ₽ по календарным дням в рамках фильтра.</p>
          <div className="analytics-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSeries} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #333)" opacity={0.6} />
                <XAxis dataKey="x" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                <Tooltip formatter={(v) => (v != null ? formatMoney(v) : '')} labelFormatter={(l) => `Дата ${l}`} />
                <Line
                  type="monotone"
                  dataKey="sumRub"
                  name="Оборот"
                  stroke="var(--gold, #b8860b)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {weekSeries.length > 0 && !loading && (
        <section className="glass analytics-chart-card team-week-section">
          <h3 className="analytics-h3">Сводка по неделям</h3>
          <p className="muted small an-h3-sub">
            Неделя с понедельника (ISO). Столбцы — оборот за неделю; цвет к предыдущей неделе в этом отчёте (зелёный
            выше, оранжевый ниже). В таблице — те же цифры и % к пред. неделе.
          </p>
          <div className="team-week-chart-h">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekSeries}
                margin={{ top: 8, right: 8, left: 4, bottom: weekSeries.length > 6 ? 20 : 6 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #333)" opacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={weekSeries.length > 6 ? -22 : 0}
                  textAnchor={weekSeries.length > 6 ? 'end' : 'middle'}
                  height={weekSeries.length > 6 ? 52 : 30}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                <Tooltip
                  labelFormatter={(label) => `Неделя с ${label}`}
                  formatter={(value, _name, item) => {
                    const pl = item?.payload;
                    if (!pl) return formatMoney(value);
                    const d = pl.deltaPct;
                    const tail = d == null ? '' : ` · к пред.: ${d > 0 ? '+' : ''}${d}%`;
                    return [`${formatMoney(value)}${tail}`, 'Оборот'];
                  }}
                />
                <Bar dataKey="sumRub" name="Оборот" radius={[4, 4, 0, 0]}>
                  {weekSeries.map((entry, i) => (
                    <Cell key={entry.weekStart || i} fill={WEEK_BAR[entry.barTone] || WEEK_BAR.neu} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="analytics-op-table-wrap">
            <table className="analytics-op-table team-week-table">
              <thead>
                <tr>
                  <th>Неделя с</th>
                  <th className="mono-nums">Сделок</th>
                  <th className="mono-nums">Оборот</th>
                  <th className="mono-nums">к пред.</th>
                  <th className="mono-nums">Лом, г</th>
                  <th className="mono-nums">Чист., г</th>
                </tr>
              </thead>
              <tbody>
                {weekSeries.map((w) => (
                  <tr key={w.weekStart}>
                    <td>{w.label}</td>
                    <td className="mono-nums">{w.deals}</td>
                    <td className="mono-nums">{formatMoney(w.sumRub)}</td>
                    <td className="mono-nums">
                      <WeekDeltaCell deltaPct={w.deltaPct} />
                    </td>
                    <td className="mono-nums">{(w.weightGrossSum ?? 0).toFixed(2)}</td>
                    <td className="mono-nums">{(w.weightNetSum ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style>{`
        .team-page { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }
        .team-hero {
          padding: 18px 18px 16px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .team-hero-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          flex-wrap: wrap;
        }
        .team-kicker {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--gold, #b8860b);
          margin: 0 0 6px;
          font-weight: 600;
        }
        .team-title {
          font-family: var(--font-display, inherit);
          font-size: 1.45rem;
          font-weight: 700;
          margin: 0 0 8px;
          line-height: 1.2;
          color: var(--text, #faf8f4);
        }
        .team-subtitle {
          margin: 0;
          font-size: 0.92rem;
          line-height: 1.45;
          color: var(--text-muted, #a8a29e);
          max-width: 52ch;
        }
        .team-mode-badge {
          flex-shrink: 0;
          font-size: 0.72rem;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid var(--stroke);
          background: var(--input-bg, rgba(255,255,255,0.04));
          color: var(--text-muted);
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .team-mode-badge--mgr {
          border-color: rgba(184, 134, 11, 0.45);
          background: var(--gold-soft, rgba(184, 134, 11, 0.12));
          color: var(--gold, #d4a20d);
        }
        .team-rules {
          margin: 4px 0 0;
          padding: 14px 16px;
          border-radius: 12px;
          background: var(--input-bg, rgba(0,0,0,0.18));
          border: 1px solid var(--stroke, rgba(255,255,255,0.06));
        }
        .team-rules-title {
          margin: 0 0 10px;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .team-rules-list {
          margin: 0;
          padding-left: 1.15rem;
          font-size: 0.82rem;
          line-height: 1.55;
          color: var(--text-muted);
        }
        .team-rules-list li { margin-bottom: 8px; }
        .team-rules-list strong { color: var(--text, #e7e2da); font-weight: 600; }
        .team-rules-note { margin: 10px 0 0; line-height: 1.45; }
        .team-tier-legend { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--stroke); }
        .team-tier-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .team-chip {
          font-size: 0.72rem;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid var(--stroke);
        }
        .team-chip-high { border-color: rgba(184, 134, 11, 0.5); background: rgba(184, 134, 11, 0.1); color: var(--gold); }
        .team-chip-mid { border-color: rgba(255,255,255,0.12); color: var(--text-muted); }
        .team-chip-low { opacity: 0.85; color: var(--text-muted); }
        .team-toolbar { flex-wrap: wrap; align-items: center; gap: 10px; }
        .team-btn-pdf { font-weight: 600; }
        /* Пресеты и поля дат — стили применяются здесь, чтобы вкладка работала без Analytics */
        .team-page .analytics-presets {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .team-page .an-pill {
          border: 1px solid var(--stroke);
          background: var(--input-bg);
          color: var(--text);
          font-size: 0.75rem;
          padding: 5px 10px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 600;
        }
        .team-page .an-pill:hover {
          border-color: var(--gold);
          color: var(--gold);
        }
        .team-page .analytics-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 10px;
        }
        .team-page .field.field-inline {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .team-page .field.field-inline .field-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .team-page .field.field-inline input {
          min-width: 9rem;
        }
        .team-filter-block {
          padding: 14px 16px;
          border-radius: 12px;
          margin-top: 4px;
        }
        .team-filter-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .team-filter-title {
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .team-filter-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: min(52vh, 420px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .team-filter-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          width: 100%;
          margin: 0;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--stroke, rgba(255,255,255,0.08));
          background: var(--input-bg, rgba(255,255,255,0.03));
          cursor: pointer;
          box-sizing: border-box;
        }
        .team-filter-row:hover {
          border-color: rgba(184, 134, 11, 0.35);
          background: rgba(184, 134, 11, 0.06);
        }
        .team-filter-cb {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          margin: 2px 0 0;
          accent-color: var(--gold, #b8860b);
          cursor: pointer;
        }
        .team-filter-cb:focus {
          outline: none;
        }
        .team-filter-cb:focus-visible {
          outline: 2px solid var(--gold, #b8860b);
          outline-offset: 2px;
        }
        .team-filter-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
          text-align: left;
        }
        .team-filter-email {
          font-size: 0.86rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text, #e7e2da);
        }
        .team-filter-role {
          font-size: 0.72rem;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .team-filter-hint { margin: 12px 0 0; line-height: 1.4; }
        /* Таблицы и график на этой вкладке */
        .team-page .analytics-op-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          min-width: 0;
        }
        .team-page .analytics-op-table {
          width: 100%;
          min-width: 520px;
          border-collapse: collapse;
          font-size: 0.86rem;
        }
        .team-page .analytics-op-table th,
        .team-page .analytics-op-table td {
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid var(--stroke, rgba(255,255,255,0.08));
        }
        .team-page .analytics-op-table th {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .team-page .analytics-op-table tr:last-child td {
          border-bottom: none;
        }
        .team-page .team-table th.mono-nums,
        .team-page .team-table td.mono-nums {
          text-align: right;
        }
        .team-page .team-table th:first-child,
        .team-page .team-table td:first-child {
          text-align: center;
        }
        .team-page .team-table td:first-child.mono-nums {
          text-align: center;
        }
        .team-page .team-table th:nth-child(2),
        .team-page .team-table td:nth-child(2) {
          text-align: left;
        }
        .team-page .analytics-chart-card {
          padding: 16px;
        }
        .team-page .analytics-h3 {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0 0 4px;
        }
        .team-page .an-h3-sub {
          margin: 0 0 10px;
          line-height: 1.4;
        }
        .team-page .analytics-chart-h {
          width: 100%;
          min-width: 0;
          height: 220px;
        }
        @media (max-width: 640px) {
          .team-page .team-hero {
            padding: 14px 12px 12px;
          }
          .team-page .team-hero-top {
            flex-direction: column;
          }
          .team-page .team-mode-badge {
            align-self: flex-start;
          }
          .team-page .analytics-filters.team-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .team-page .analytics-filters.team-toolbar .btn-ghost,
          .team-page .analytics-filters.team-toolbar .btn-secondary {
            width: 100%;
          }
          .team-page .field.field-inline input {
            width: 100%;
            min-width: 0;
          }
          .team-page .team-kpi-grid {
            grid-template-columns: 1fr;
          }
          .team-page .team-filter-list {
            max-height: min(60vh, 360px);
          }
          .team-page .team-filter-email {
            white-space: normal;
            word-break: break-word;
          }
          .team-page .analytics-op-table {
            font-size: 0.78rem;
          }
          .team-page .analytics-op-table th,
          .team-page .analytics-op-table td {
            padding: 7px 8px;
          }
          .team-page .analytics-chart-h {
            height: 200px;
          }
        }
        .team-period-line { margin: 0 0 4px; text-align: center; }
        .team-kpi-section { margin-top: 4px; }
        .team-section-title {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin: 0 0 12px;
          font-weight: 700;
        }
        .team-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .team-kpi-card {
          position: relative;
          padding: 16px 16px 14px;
          border-radius: 14px;
          border: 1px solid var(--stroke);
          background: var(--bg-panel-solid, rgba(24,22,18,0.85));
          box-shadow: 0 4px 24px rgba(0,0,0,0.12);
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 118px;
        }
        .team-kpi-card--accent {
          border-color: rgba(184, 134, 11, 0.35);
          background: linear-gradient(145deg, rgba(184, 134, 11, 0.14), var(--bg-panel-solid, rgba(24,22,18,0.9)));
        }
        .team-kpi-icon {
          font-size: 0.9rem;
          opacity: 0.65;
          margin-bottom: 2px;
        }
        .team-kpi-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-weight: 600;
        }
        .team-kpi-value {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--text, #faf8f4);
          line-height: 1.15;
        }
        .team-kpi-card--accent .team-kpi-value { color: var(--gold, #e8c547); }
        .team-kpi-hint { font-size: 0.72rem; margin-top: auto; line-height: 1.35; }
        .team-empty {
          padding: 28px 20px;
          text-align: center;
          border-radius: 14px;
        }
        .team-empty-title { margin: 0 0 8px; font-weight: 600; font-size: 1.05rem; }
        .team-skeleton { padding: 24px; text-align: center; border-radius: 14px; }
        .team-table-card { padding: 16px 14px 18px; border-radius: 14px; }
        .team-table-head { margin-bottom: 12px; }
        .team-table-title { margin: 0 0 6px; }
        .team-table-desc { margin: 0; max-width: 62ch; line-height: 1.4; }
        .team-table thead th { font-size: 0.72rem; letter-spacing: 0.04em; }
        .team-rank-cell { font-size: 1.05rem; vertical-align: middle; }
        .team-chart-card .an-h3-sub { margin-top: -4px; }
        .team-tier-high { font-weight: 600; color: var(--gold, #e8c547); }
        .team-tier-mid { font-weight: 600; color: var(--text, #e7e2da); }
        .team-tier-low { color: var(--text-muted, #a8a29e); }
        .team-env-name {
          font-family: ui-monospace, 'Cascadia Code', monospace;
          font-size: 0.72rem;
          color: var(--gold, #d4a20d);
        }
        .team-week-chart-h {
          width: 100%;
          min-width: 0;
          height: 200px;
          margin-bottom: 4px;
        }
        .team-week-delta { font-weight: 600; }
        .team-week-delta--up { color: #6ee7a8; }
        .team-week-delta--down { color: #f0a8a8; }
        .team-week-delta--flat { color: var(--text-muted); }
        .team-page .team-week-table { min-width: 560px; }
      `}</style>
    </div>
  );
}
