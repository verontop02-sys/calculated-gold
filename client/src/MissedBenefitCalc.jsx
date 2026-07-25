import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fintechApi } from './api.js';

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

/**
 * Калькулятор упущенной выгоды по официальному курсу ЦБ РФ.
 * Не требует авторизации (эндпоинт /api/public/fintech/cbr-gold-history публичный) —
 * используется и на публичном лендинге /invest, и внутри кабинета инвестора.
 */
export function MissedBenefitCalc({ compact = false, onOpenFull }) {
  const [points, setPoints] = useState(null);
  const [investRub, setInvestRub] = useState(3_000_000);
  const [buyYear, setBuyYear] = useState(2010);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fintechApi
      .cbrGoldHistory()
      .then((out) => {
        if (!alive) return;
        const pts = out.points || [];
        setPoints(pts);
        if (pts.length) {
          const years = pts.map((p) => p.year);
          const mid = years[Math.floor(years.length / 2)] || 2010;
          setBuyYear((y) => (years.includes(y) ? y : mid));
        }
      })
      .catch((e) => {
        if (alive) {
          setPoints([]);
          setErr(e?.message || 'История ЦБ временно недоступна');
        }
      });
    return () => { alive = false; };
  }, []);

  const yearBounds = useMemo(() => {
    if (!points?.length) return { min: 2000, max: new Date().getFullYear() };
    return { min: points[0].year, max: points[points.length - 1].year };
  }, [points]);

  const result = useMemo(() => {
    if (!points?.length || !investRub) return null;
    const past = [...points].reverse().find((p) => p.year <= buyYear) || points[0];
    const now = points[points.length - 1];
    if (!past?.price || !now?.price) return null;
    const grams = investRub / past.price;
    const todayValue = grams * now.price;
    const profit = todayValue - investRub;
    const pct = investRub > 0 ? (profit / investRub) * 100 : 0;
    return {
      pastPrice: past.price,
      nowPrice: now.price,
      pastYear: past.year,
      grams,
      todayValue,
      profit,
      pct,
    };
  }, [points, investRub, buyYear]);

  const chartData = useMemo(() => {
    if (!points?.length) return [];
    return points.map((p) => ({ year: String(p.year), price: p.price }));
  }, [points]);

  if (compact) {
    return (
      <div className="mbc mbc-compact">
        <div className="mbc-compact-head">
          <div>
            <span className="mbc-label">Упущенная выгода</span>
            <h3 className="mbc-title" style={{ margin: '2px 0 0' }}>Сколько вы могли заработать?</h3>
          </div>
          {onOpenFull && <button type="button" className="mbc-link" onClick={onOpenFull}>Открыть →</button>}
        </div>
        {result ? (
          <div className="mbc-compact-res">
            <span className="mbc-pos">+{formatMoney(result.profit)}</span>
            <span className="mbc-pct mbc-pos">+{Math.round(result.pct).toLocaleString('ru-RU')}%</span>
          </div>
        ) : (
          <p className="mbc-muted" style={{ margin: 0 }}>{points === null ? 'Считаем…' : 'Нет данных'}</p>
        )}
        <p className="mbc-disclaimer">Анализ по курсу ЦБ РФ, не инвестиционное предложение.</p>
        <MbcStyle />
      </div>
    );
  }

  return (
    <div className="mbc mbc-full">
      <div className="mbc-head">
        <div>
          <span className="mbc-pill">Рост золота по данным ЦБ РФ</span>
          <h2 className="mbc-title mbc-title--lg" style={{ marginTop: 8 }}>Калькулятор упущенной выгоды</h2>
          <p className="mbc-sub">Сколько вы могли бы заработать, купив золото раньше?</p>
        </div>
      </div>

      {err && <p className="mbc-err">{err}</p>}
      {points === null && <p className="mbc-muted"><span className="mbc-spinner" /> Загружаем историю ЦБ…</p>}

      {chartData.length > 1 && (
        <div className="mbc-chart" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="mbcFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft, var(--stroke))" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'var(--text-dim, var(--text-muted))', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis
                tickFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')}`}
                tick={{ fill: 'var(--text-dim, var(--text-muted))', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-panel-solid)',
                  border: '1px solid var(--stroke)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--text)',
                }}
                formatter={(v) => [`${Number(v).toLocaleString('ru-RU')} ₽/г`, 'ЦБ']}
              />
              <Area type="monotone" dataKey="price" stroke="var(--accent)" strokeWidth={2} fill="url(#mbcFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mbc-disclaimer">*по официальным данным ЦБ РФ</p>
        </div>
      )}

      <div className="mbc-sliders">
        <label className="mbc-slider">
          <div className="mbc-slider-head">
            <span>Сумма вложений в золото</span>
            <strong>{formatMoney(investRub)}</strong>
          </div>
          <input
            type="range"
            min={100_000}
            max={10_000_000}
            step={50_000}
            value={investRub}
            onChange={(e) => setInvestRub(Number(e.target.value))}
          />
          <div className="mbc-slider-ends"><span>100 000 ₽</span><span>10 000 000 ₽</span></div>
        </label>
        <label className="mbc-slider">
          <div className="mbc-slider-head">
            <span>Год приобретения золота</span>
            <strong>{buyYear}</strong>
          </div>
          <input
            type="range"
            min={yearBounds.min}
            max={yearBounds.max}
            step={1}
            value={Math.min(yearBounds.max, Math.max(yearBounds.min, buyYear))}
            onChange={(e) => setBuyYear(Number(e.target.value))}
            disabled={!points?.length}
          />
          <div className="mbc-slider-ends"><span>{yearBounds.min}</span><span>{yearBounds.max}</span></div>
        </label>
      </div>

      {result && (
        <div className="mbc-result">
          <div className="mbc-result-box">
            <span className="mbc-label">Вы могли бы заработать</span>
            <div className="mbc-result-nums">
              <span className="mbc-profit mbc-pos">+ {formatMoney(result.profit)}</span>
              <span className="mbc-pct-lg mbc-pos">+{Math.round(result.pct).toLocaleString('ru-RU')}%</span>
            </div>
            <p className="mbc-disclaimer">*без учёта уплаты НДФЛ и комиссий</p>
          </div>
          <div className="mbc-result-today">
            <span className="mbc-label">Сегодня у вас было бы</span>
            <span className="mbc-result-today-val">{formatMoney(result.todayValue)}</span>
          </div>
        </div>
      )}
      <p className="mbc-disclaimer" style={{ marginTop: 12 }}>
        Материалы носят иллюстративный характер и не являются индивидуальной инвестиционной рекомендацией или обещанием доходности. Прошлый рост не гарантирует будущий результат.
      </p>
      <MbcStyle />
    </div>
  );
}

let styleInjected = false;
function MbcStyle() {
  useEffect(() => {
    if (styleInjected) return;
    styleInjected = true;
    const tag = document.createElement('style');
    tag.setAttribute('data-mbc-style', '1');
    tag.textContent = MBC_CSS;
    document.head.appendChild(tag);
  }, []);
  return null;
}

const MBC_CSS = `
.mbc {
  border-radius: 18px;
  border: 1px solid var(--stroke);
  background: var(--bg-panel-solid);
  padding: 18px 20px;
  box-sizing: border-box;
}
.mbc-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
  color: var(--accent); background: var(--accent-soft, rgba(230,0,0,0.1));
  padding: 4px 10px; border-radius: 100px;
}
.mbc-title { font-size: 1rem; font-weight: 700; margin: 0 0 4px; color: var(--text-strong); letter-spacing: -0.01em; }
.mbc-title--lg { font-size: 1.3rem; }
.mbc-sub { margin: 0 0 12px; font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; }
.mbc-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; }
.mbc-muted { color: var(--text-muted); font-size: 0.88rem; display: flex; align-items: center; gap: 8px; }
.mbc-err { color: #ff5a5a; font-size: 0.85rem; margin: 0; }
.mbc-link { background: none; border: none; color: var(--accent); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 4px 0; white-space: nowrap; }
.mbc-link:hover { text-decoration: underline; }
.mbc-pos { color: var(--emerald, #16c784); }
.mbc-spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--stroke); border-top-color: var(--accent);
  animation: mbcSpin 0.7s linear infinite; display: inline-block;
}
@keyframes mbcSpin { to { transform: rotate(360deg); } }
.mbc-chart { margin: 2px -4px 0; }
.mbc-sliders { display: flex; flex-direction: column; gap: 16px; margin: 8px 0 16px; }
.mbc-slider { display: flex; flex-direction: column; gap: 6px; }
.mbc-slider-head { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-muted); }
.mbc-slider-head strong { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.mbc-slider input[type="range"] { width: 100%; accent-color: var(--accent); cursor: pointer; }
.mbc-slider-ends { display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-dim, var(--text-muted)); }
.mbc-result { display: flex; flex-direction: column; gap: 10px; }
.mbc-result-box {
  border-radius: 14px; border: 1px solid var(--stroke); background: var(--bg-deep, transparent);
  padding: 14px 16px;
}
.mbc-result-nums { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
.mbc-profit { font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.mbc-pct-lg { font-size: 1.25rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.mbc-result-today {
  border-radius: 14px; padding: 14px 16px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000));
  color: #fff; display: flex; flex-direction: column; gap: 4px;
}
.mbc-result-today .mbc-label { color: rgba(255,255,255,0.75); }
.mbc-result-today-val { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.mbc-disclaimer { margin: 8px 0 0; font-size: 0.68rem; color: var(--text-dim, var(--text-muted)); line-height: 1.4; }
.mbc-compact { padding: 16px 18px; }
.mbc-compact-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.mbc-compact-res { display: flex; align-items: baseline; gap: 10px; margin: 10px 0 4px; font-size: 1.15rem; font-weight: 800; }
`;
