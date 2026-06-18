import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator } from './Calculator.jsx';
import { ClientPresentation } from './ClientPresentation.jsx';
import { api } from './api.js';
import { calculateBuybackRange, mergeSettings } from './calc.js';
import { computeClientView } from './clientView.js';

const DISPLAY_CODE_KEY = 'cg_display_operator_code';
const DISPLAY_CITY_KEY = 'cg_client_view_city';

function genDisplayCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getDisplayCode() {
  try {
    let c = localStorage.getItem(DISPLAY_CODE_KEY);
    if (!c) { c = genDisplayCode(); localStorage.setItem(DISPLAY_CODE_KEY, c); }
    return c;
  } catch {
    return genDisplayCode();
  }
}

/**
 * Двухколоночный дашборд для калькулятора.
 * Слева — сам Calculator (без изменений).
 * Справа — правая «приборная панель»: курс, политика выкупа, сегодня, экран клиента.
 */
export function CalculatorPage({ formatMoney, price, userUid, onGoToContract, toast }) {
  const [settings, setSettings] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [clientView, setClientView] = useState({ open: false, weight: null, purity: null });

  // Экран клиента (покупательский дисплей)
  const [summary, setSummary] = useState(null);
  const [displayCode] = useState(getDisplayCode);
  const [cityId, setCityId] = useState(() => {
    try { return localStorage.getItem(DISPLAY_CITY_KEY) || ''; } catch { return ''; }
  });
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayInfo, setDisplayInfo] = useState(null); // { connected, at }
  const [lastInput, setLastInput] = useState(null); // { weight, purity }

  useEffect(() => {
    api.settings().then(setSettings).catch(() => setSettings(null));
    const onSaved = (e) => {
      if (e?.detail?.settings) setSettings(e.detail.settings);
    };
    window.addEventListener('cg:settings-saved', onSaved);
    return () => window.removeEventListener('cg:settings-saved', onSaved);
  }, []);

  useEffect(() => {
    api.goldIndexPublicSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    if (!cityId && summary?.cities?.length) setCityId(summary.cities[0].id);
  }, [summary, cityId]);

  useEffect(() => {
    if (!cityId) return;
    try { localStorage.setItem(DISPLAY_CITY_KEY, cityId); } catch { /* ignore */ }
  }, [cityId]);

  const openClientDisplay = useCallback(() => {
    const url = `${window.location.origin}/display?code=${encodeURIComponent(displayCode)}`;
    window.open(url, 'cg-client-display', 'width=1280,height=800');
  }, [displayCode]);

  const pushToDisplay = useCallback(async ({ weight, purity }) => {
    const view = computeClientView({ settings, price, summary, cityId, weight, purity });
    if (!view.ready) {
      toast?.('Сначала введите вес и пробу', 'info');
      return;
    }
    setDisplayBusy(true);
    try {
      const r = await api.clientDisplayPush(displayCode, { mode: 'show', view, brandName: 'REAKTIVO PRO' });
      setLastInput({ weight, purity });
      const connected = (r?.subscribers || 0) > 0;
      setDisplayInfo({ connected, at: Date.now() });
      if (connected) toast?.('Показано на экране клиента', 'success');
      else toast?.('Экран клиента не подключён — откройте его кнопкой справа', 'info');
    } catch (e) {
      toast?.(e?.message || 'Не удалось отправить на экран клиента', 'error');
    } finally {
      setDisplayBusy(false);
    }
  }, [settings, price, summary, cityId, displayCode, toast]);

  const clearDisplay = useCallback(async () => {
    setDisplayBusy(true);
    try {
      await api.clientDisplayPush(displayCode, { mode: 'idle' });
      toast?.('Экран клиента очищен', 'success');
    } catch (e) {
      toast?.(e?.message || 'Не удалось очистить экран', 'error');
    } finally {
      setDisplayBusy(false);
    }
  }, [displayCode, toast]);

  useEffect(() => {
    let alive = true;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    api.analyticsSummary?.(iso, iso)
      .then((d) => { if (alive) setTodayStats(d); })
      .catch(() => { if (alive) setTodayStats(null); });
    return () => { alive = false; };
  }, []);

  const buyPct = settings?.buybackPercentOfScrap != null ? Number(settings.buybackPercentOfScrap) : null;
  const corridor = settings?.rangeHalfWidthPercent != null ? Number(settings.rangeHalfWidthPercent) : null;
  const goldRub = price?.goldRubPerGram;
  const buybackRub = goldRub && buyPct ? Math.round(goldRub * (buyPct / 100)) : null;

  // Выкуп за 1 грамм изделия указанной пробы (с учётом политики и поправок по пробе).
  const perGram = useMemo(() => {
    if (!goldRub || !settings) return {};
    const calc = (purity) => {
      const r = calculateBuybackRange({
        weightGrams: 1,
        purityPerThousand: purity,
        goldRubPerGram: goldRub,
        settings: mergeSettings(settings),
      });
      return r.ok ? Math.round(r.midRub) : null;
    };
    return { 585: calc(585), 750: calc(750) };
  }, [goldRub, settings]);

  const todaySum = todayStats?.totals?.sumRub ?? null;
  const todayDeals = todayStats?.totals?.deals ?? null;

  return (
    <div className="cg-page">
      <div className="cg-page__main cg-calc-page__main">
        <Calculator
          formatMoney={formatMoney}
          price={price}
          userUid={userUid}
          onGoToContract={onGoToContract}
          onShowClient={pushToDisplay}
        />
      </div>

      <aside className="cg-page__side cg-stagger">
        {/* Карточка: экран клиента (покупательский дисплей) */}
        <div className="cg-side-card cg-cd-card">
          <div className="cg-side-card__head">
            <span className="cg-side-card__title">Экран клиента</span>
            <span className={`cg-cd-status${displayInfo?.connected ? ' cg-cd-status--on' : ''}`}>
              <span className="cg-cd-status__dot" />
              {displayInfo?.connected ? 'Подключён' : 'Не подключён'}
            </span>
          </div>
          <p className="cg-cd-card__hint">
            Нажмите «Показать клиенту» в калькуляторе — расчёт загорится на отдельном экране для клиента.
          </p>

          {summary?.cities?.length > 0 && (
            <label className="cg-cd-city">
              <span className="cg-cd-city__label">Город для сравнения</span>
              <select className="cg-cd-city__select" value={cityId || ''} onChange={(e) => setCityId(e.target.value)}>
                {summary.cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.cityName} · {c.regionName}</option>
                ))}
              </select>
            </label>
          )}

          <div className="cg-cd-actions">
            <button type="button" className="cg-cd-btn cg-cd-btn--primary" onClick={openClientDisplay}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              Открыть на 2-м экране
            </button>
            <button
              type="button"
              className="cg-cd-btn"
              onClick={() => lastInput && setClientView({ open: true, weight: lastInput.weight, purity: lastInput.purity })}
              disabled={!lastInput}
              title={lastInput ? 'Предпросмотр на этом экране' : 'Сначала покажите расчёт клиенту'}
            >
              Предпросмотр
            </button>
            <button type="button" className="cg-cd-btn" onClick={clearDisplay} disabled={displayBusy}>
              Очистить
            </button>
          </div>

          <div className="cg-cd-pair">
            <span className="cg-cd-pair__txt">На планшете откройте <b>{displayHost()}/display</b> и введите код:</span>
            <span className="cg-cd-pair__code">{displayCode}</span>
          </div>
        </div>

        {/* Карточка: ваш выкуп за грамм */}
        <div className="cg-side-card cg-side-card--accent">
          <div className="cg-side-card__label">Ваш выкуп, чистое золото</div>
          <div className="cg-side-card__value mono-nums">
            {buybackRub != null ? formatMoney(buybackRub) : '—'}
            <span className="cg-side-card__per"> / г</span>
          </div>
          <div className="cg-side-card__sub">
            {buyPct != null ? `${buyPct}% от ${goldRub ? formatMoney(goldRub) : '—'} (биржа)` : 'Настройте политику в «Настройки»'}
          </div>

          {/* Выкуп за грамм по ходовым пробам */}
          <div className="cg-pergram">
            <div className="cg-pergram__item">
              <span className="cg-pergram__probe">585</span>
              <span className="cg-pergram__val mono-nums">
                {perGram[585] != null ? formatMoney(perGram[585]) : '—'}
                <span className="cg-pergram__per"> / г</span>
              </span>
            </div>
            <div className="cg-pergram__item">
              <span className="cg-pergram__probe">750</span>
              <span className="cg-pergram__val mono-nums">
                {perGram[750] != null ? formatMoney(perGram[750]) : '—'}
                <span className="cg-pergram__per"> / г</span>
              </span>
            </div>
          </div>
        </div>

        {/* Карточка: политика */}
        <div className="cg-side-card">
          <div className="cg-side-card__head">
            <span className="cg-side-card__title">Политика выкупа</span>
          </div>
          <div className="cg-side-card__rows">
            <div className="cg-side-row">
              <span className="cg-side-row__k">Процент от биржи</span>
              <span className="cg-side-row__v tone-gold">{buyPct != null ? `${buyPct}%` : '—'}</span>
            </div>
            <div className="cg-side-row">
              <span className="cg-side-row__k">Коридор</span>
              <span className="cg-side-row__v">{corridor != null ? `±${corridor}%` : '—'}</span>
            </div>
            <div className="cg-side-row">
              <span className="cg-side-row__k">Источник курса</span>
              <span className="cg-side-row__v">{quoteSourceLabel(price)}</span>
            </div>
          </div>
        </div>

        {/* Карточка: сегодня */}
        {(todayDeals != null || todaySum != null) && (
          <div className="cg-side-card">
            <div className="cg-side-card__head">
              <span className="cg-side-card__title">Сегодня</span>
              <span className="cg-side-card__date small muted">{formatTodayLabel()}</span>
            </div>
            <div className="cg-side-card__stats">
              <div className="cg-side-stat">
                <span className="cg-side-stat__k">Сделок</span>
                <span className="cg-side-stat__v">{todayDeals ?? 0}</span>
              </div>
              <div className="cg-side-stat">
                <span className="cg-side-stat__k">Сумма</span>
                <span className="cg-side-stat__v tone-gold">{todaySum != null ? formatMoney(todaySum) : '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Подсказка */}
        <div className="cg-side-card cg-side-card--emerald cg-side-card--hint">
          <div className="cg-side-card__hint-icon" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <div>
            <div className="cg-side-card__title">Как работает расчёт</div>
            <p className="cg-side-card__hint-text">
              Курс чистого золота × {buyPct ?? 70}% × масса × проба = ориентир.
              Диапазон выкупа ± {corridor ?? 1}% от ориентира.
            </p>
          </div>
        </div>
      </aside>

      <ClientPresentation
        open={clientView.open}
        onClose={() => setClientView((v) => ({ ...v, open: false }))}
        formatMoney={formatMoney}
        price={price}
        weight={clientView.weight}
        purity={clientView.purity}
      />

      <style>{`
        .cg-calc-page__main { max-width: 600px; }
        @media (max-width: 1100px) { .cg-calc-page__main { max-width: none; } }

        /* ── Карточка «Экран клиента» ── */
        .cg-cd-card { display: flex; flex-direction: column; gap: 12px; }
        .cg-cd-status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.7rem; font-weight: 600;
          color: var(--text-muted);
        }
        .cg-cd-status__dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--text-dim);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-dim) 18%, transparent);
        }
        .cg-cd-status--on { color: var(--emerald); }
        .cg-cd-status--on .cg-cd-status__dot {
          background: var(--emerald);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--emerald) 22%, transparent);
        }
        .cg-cd-card__hint { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; }

        .cg-cd-city { display: flex; flex-direction: column; gap: 5px; }
        .cg-cd-city__label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .cg-cd-city__select {
          width: 100%; box-sizing: border-box;
          padding: 9px 11px; border-radius: 10px;
          background: var(--input-bg, var(--bg-elevated)); border: 1px solid var(--stroke);
          color: var(--text); font-size: 0.85rem; font-weight: 500; cursor: pointer;
        }
        .cg-cd-city__select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

        .cg-cd-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .cg-cd-btn {
          flex: 1; min-width: 100px;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--stroke); background: transparent;
          color: var(--text); font-size: 0.82rem; font-weight: 600; cursor: pointer;
          transition: background 0.16s, border-color 0.16s, color 0.16s, opacity 0.16s;
        }
        .cg-cd-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
        .cg-cd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cg-cd-btn--primary {
          flex-basis: 100%;
          background: var(--accent); color: #fff; border-color: var(--accent);
        }
        .cg-cd-btn--primary:hover:not(:disabled) { background: var(--accent); color: #fff; opacity: 0.92; }

        .cg-cd-pair {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          background: var(--bg-elevated); border: 1px dashed var(--stroke);
        }
        .cg-cd-pair__txt { font-size: 0.72rem; color: var(--text-muted); line-height: 1.45; }
        .cg-cd-pair__txt b { color: var(--text); font-weight: 600; }
        .cg-cd-pair__code {
          flex-shrink: 0;
          font-size: 1.1rem; font-weight: 800; letter-spacing: 0.18em;
          color: var(--accent); font-family: var(--font-display, inherit);
          padding: 4px 10px; border-radius: 8px; background: var(--accent-soft);
        }

        .cg-pergram {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--stroke);
        }
        .cg-pergram__item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: var(--bg-panel-solid, rgba(255,255,255,0.5));
          border: 1px solid var(--stroke-soft, var(--stroke));
        }
        .cg-pergram__probe {
          font-size: 0.64rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .cg-pergram__val {
          font-size: 0.98rem;
          font-weight: 700;
          color: var(--gold);
          line-height: 1.1;
        }
        .cg-pergram__per { font-size: 0.66rem; color: var(--text-muted); font-weight: 500; }
      `}</style>
    </div>
  );
}

function displayHost() {
  try {
    return window.location.host;
  } catch {
    return 'reaktivo.pro';
  }
}

function quoteSourceLabel(price) {
  if (!price) return '—';
  if (price.source === 'xaut') return 'XAUT USD → ЦБ';
  if (price.source === 'moex') return 'Мосбиржа';
  return 'ЦБ РФ';
}

function formatTodayLabel() {
  const d = new Date();
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

