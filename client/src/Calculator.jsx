import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { calculateBuybackRange } from './calc.js';
import { PageHint } from './PageHint.jsx';

const GOLD_PRESETS = ['585', '750', '999'];
const SILVER_PRESETS = ['925', '875', '999'];

function calcLocalKeys(userUid, metal = 'gold') {
  const id = userUid && String(userUid).trim() ? String(userUid).replace(/[^a-zA-Z0-9-]/g, '') : '';
  const suffix = id || 'anon';
  const m = metal === 'silver' ? 'ag' : 'au';
  return { weight: `cg_weight_${m}__${suffix}`, purity: `cg_purity_${m}__${suffix}` };
}

function quoteRowLabel(price, metal = 'gold') {
  if (metal === 'silver') {
    if (!price) return 'По курсу чистого серебра';
    return 'По курсу ЦБ (чистое серебро)';
  }
  if (!price) return 'По курсу чистого золота';
  if (price.source === 'xaut') return 'По курсу XAUT (USD→₽, ЦБ), чистое золото';
  if (price.source === 'moex') return 'По курсу Мосбиржи (чистое золото)';
  if (price.fallbackFrom === 'moex') return 'По курсу ЦБ, резерв (чистое золото)';
  return 'По курсу ЦБ (чистое золото)';
}

export function Calculator({
  formatMoney,
  price,
  userUid,
  onGoToContract,
  onShowClient,
  channel = 'office',
  metal = 'gold',
}) {
  const isSilver = metal === 'silver';
  const PRESETS = isSilver ? SILVER_PRESETS : GOLD_PRESETS;
  const defaultPurity = isSilver ? '925' : '585';
  const lsKeys = useMemo(() => calcLocalKeys(userUid, metal), [userUid, metal]);

  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [weightErr, setWeightErr] = useState('');
  const [purity, setPurity] = useState(defaultPurity);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [justCalced, setJustCalced] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);

  useEffect(() => {
    setWeight(localStorage.getItem(lsKeys.weight) || '');
    setPurity(localStorage.getItem(lsKeys.purity) || defaultPurity);
    setWeightErr('');
    setResult(null);
    setErr('');
    setJustCalced(false);
    setCopied(false);
  }, [lsKeys.weight, lsKeys.purity, defaultPurity]);

  useEffect(() => {
    setSettingsLoading(true);
    api
      .settings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setSettingsLoading(false));
  }, []);

  useEffect(() => {
    function onSettingsSaved(e) {
      if (e?.detail?.settings) {
        setSettings(e.detail.settings);
        return;
      }
      api
        .settings()
        .then(setSettings)
        .catch(() => setSettings(null));
    }
    window.addEventListener('cg:settings-saved', onSettingsSaved);
    return () => window.removeEventListener('cg:settings-saved', onSettingsSaved);
  }, []);

  const purityOptions = useMemo(() => {
    if (isSilver) {
      const order = settings?.silver?.purityOrder || [800, 875, 925, 999];
      return [...new Set(order.map((p) => Number(p)).filter((p) => Number.isFinite(p)))].map(String);
    }
    const order = settings?.purityOrder || [375, 500, 583, 585, 750, 875, 900, 916, 958, 999];
    const nums = [...new Set(order.map((p) => Number(p)).filter((p) => Number.isFinite(p)))];
    if (!nums.includes(900)) {
      const idx875 = nums.indexOf(875);
      if (idx875 >= 0) nums.splice(idx875 + 1, 0, 900);
      else nums.push(900);
    }
    return nums.map(String);
  }, [settings, isSilver]);

  const metalRub = isSilver ? price?.silverRubPerGram : price?.goldRubPerGram;
  const canCalc = metalRub != null && !settingsLoading;
  // Серебро считаем только как отделение (курьер не выезжает).
  const calcChannel = isSilver ? 'office' : channel;

  function validateWeight(val) {
    const v = String(val).replace(',', '.').trim();
    if (v === '') return '';
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return 'Введите положительное число';
    if (n > 10000) return 'Слишком большое значение';
    return '';
  }

  function handleWeightChange(e) {
    const val = e.target.value;
    setWeight(val);
    localStorage.setItem(lsKeys.weight, val);
    setWeightErr(val === '' ? '' : validateWeight(val));
    if (result) setResult(null);
  }

  function applyPurity(val) {
    setPurity(val);
    localStorage.setItem(lsKeys.purity, val);
    if (result) setResult(null);
  }

  function handlePurityChange(e) {
    if (!e.target.value) return;
    applyPurity(e.target.value);
  }

  function runCalc() {
    const wErr = validateWeight(weight);
    if (wErr) { setWeightErr(wErr); return; }
    if (!canCalc || !settings) return;

    setErr('');
    setLoading(true);
    setResult(null);
    setJustCalced(false);
    setCopied(false);

    const w = parseFloat(String(weight).replace(',', '.'));
    const p = parseInt(purity, 10);
    const r = calculateBuybackRange({
      weightGrams: w,
      purityPerThousand: p,
      goldRubPerGram: isSilver ? undefined : price.goldRubPerGram,
      metalRubPerGram: isSilver ? price.silverRubPerGram : undefined,
      settings,
      channel: calcChannel,
      metal: isSilver ? 'silver' : 'gold',
    });

    if (!r.ok) {
      setErr(r.error);
      setLoading(false);
      return;
    }

    setResult(r);
    setJustCalced(true);
    setLoading(false);

    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && canCalc && weight) runCalc();
  }

  async function handleCopy() {
    if (!result) return;
    const metalLabel = isSilver ? 'серебра' : 'золота';
    const text =
      `Расчёт выкупа ${metalLabel}\n` +
      `Вес: ${weight} г, проба ${purity}\n` +
      `Чистого ${metalLabel}: ${result.fineGrams.toFixed(3)} г\n` +
      `${quoteRowLabel(price, metal)}: ${formatMoney(result.scrapRub)}\n` +
      `Диапазон выкупа: ${formatMoney(result.lowRub)} — ${formatMoney(result.highRub)}\n` +
      `Ориентир: ${formatMoney(result.midRub)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard API not available (non-HTTPS / old browser)
    }
  }

  return (
    <div className="calc">
      <PageHint id={isSilver ? 'calc-silver' : 'calc'} title="Быстрый расчёт">
        {isSilver
          ? 'Выкуп серебра только в отделении. Вес и проба — сумма по курсу ЦБ и политике серебра в настройках.'
          : 'Введите вес и пробу — получите сумму выкупа по текущему курсу и политике. Кнопкой можно перейти к оформлению договора с уже подставленными данными.'}
      </PageHint>
      <div className="glass calc-card">
        <h2 className="calc-heading">{isSilver ? 'Расчёт выкупа серебра' : 'Расчёт выкупа золота'}</h2>
        <p className="calc-hint muted">
          {isSilver
            ? 'Укажите вес и пробу. Курс чистого серебра — ЦБ РФ. Курьер по серебру не выезжает.'
            : 'Укажите вес изделия и пробу. Курс чистого золота в верхней панели, коэффициенты в настройках.'}
        </p>
        <div className="fields">
          <label className="field">
            <span className="field-label">Вес, г</span>
            <input
              inputMode="decimal"
              value={weight}
              onChange={handleWeightChange}
              onKeyDown={handleKeyDown}
              placeholder="например 7.42"
              disabled={settingsLoading}
              className={weightErr ? 'input-err' : ''}
            />
            {weightErr && <span className="field-err">{weightErr}</span>}
          </label>

          <div className="field">
            <span className="field-label">Проба</span>
            <div className="purity-row">
              <div className="purity-presets">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`preset-btn${purity === p ? ' active' : ''}`}
                    onClick={() => applyPurity(p)}
                    disabled={settingsLoading}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <select
                value={PRESETS.includes(purity) ? '' : purity}
                onChange={handlePurityChange}
                disabled={settingsLoading}
                className="purity-select"
                title="Другие пробы"
                aria-label="Другие пробы"
              >
                <option value="" disabled>ещё</option>
                {purityOptions.filter((p) => !PRESETS.includes(p)).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {settingsLoading && (
          <p className="hint-loading muted small">
            <span className="spinner inline" /> Загружаем коэффициенты…
          </p>
        )}

        {!settingsLoading && !settings && (
          <p className="warn-box">
            Настройки пока не загрузились. Расчёт может быть неточным — обновите страницу.
          </p>
        )}

        {!canCalc && !settingsLoading && metalRub == null && (
          <p className="warn-box">
            Курс {isSilver ? 'серебра' : 'золота'} пока недоступен. Обновите страницу через минуту.
          </p>
        )}

        {err && <p className="err">{err}</p>}

        <button
          type="button"
          className={`btn-primary calc-btn${canCalc && weight && !weightErr ? ' calc-btn--ready' : ''}`}
          disabled={loading || !canCalc || settingsLoading || !weight || !!weightErr}
          onClick={runCalc}
        >
          {loading ? (
            <><span className="spinner inline" /> Считаем…</>
          ) : (
            'Рассчитать'
          )}
        </button>

        {result && (
          <div ref={resultRef} className={`result-block${justCalced ? ' result-enter' : ''}`}>
            <div className="result-row muted small">
              <span>{isSilver ? 'Чистого серебра' : 'Чистого золота'}</span>
              <span className="mono-nums">{result.fineGrams.toFixed(3)} г</span>
            </div>
            <div className="result-row muted small">
              <span>{quoteRowLabel(price)}</span>
              <span className="mono-nums">{formatMoney(result.scrapRub)}</span>
            </div>
            {result.adjPct !== 0 && (
              <div className="result-row muted small">
                <span>Поправка по пробе {result.purityUsed}</span>
                <span className="mono-nums">{result.adjPct > 0 ? '+' : ''}{result.adjPct}%</span>
              </div>
            )}
            <div className="result-hero">
              <span className="result-label muted">Диапазон выкупа</span>
              <p className="result-range mono-nums">
                {formatMoney(result.lowRub)}
                <span className="dash"> — </span>
                {formatMoney(result.highRub)}
              </p>
              <span className="result-mid muted small">ориентир: {formatMoney(result.midRub)}</span>
            </div>
            <div className="result-actions">
              {onShowClient && !isSilver && (
                <button
                  type="button"
                  className="btn-show-client"
                  onClick={() => {
                    const w = parseFloat(String(weight).replace(',', '.'));
                    onShowClient({
                      weight: Number.isFinite(w) ? w : null,
                      purity: parseInt(purity, 10),
                    });
                  }}
                  title="Полноэкранный режим для показа клиенту"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Показать клиенту
                </button>
              )}
              <button
                type="button"
                className={`btn-copy${copied ? ' btn-copy--done' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '✓ Скопировано' : 'Скопировать результат'}
              </button>
              {onGoToContract && (
                <button
                  type="button"
                  className="btn-contract"
                  onClick={() => {
                    const w = parseFloat(String(weight).replace(',', '.'));
                    onGoToContract({
                      totalRub: Math.round(result.midRub),
                      weightGrams: Number.isFinite(w) ? w : null,
                      purity: parseInt(purity, 10),
                      fineGrams: result.fineGrams,
                      itemName: isSilver ? 'Лом серебра' : 'Лом ювелирных изделий',
                      metal: isSilver ? 'Серебро' : 'Золото',
                    });
                  }}
                >
                  Договор-квитанция
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .calc { animation: fadeIn 0.35s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .calc-card { padding: 22px 20px 24px; }
        .calc-heading { font-family: var(--font-display); font-size: 1.35rem; font-weight: 600; margin: 0 0 8px; }
        .calc-hint { font-size: 0.85rem; line-height: 1.45; margin: 0 0 20px; }
        .fields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .field-err { font-size: 0.78rem; color: var(--danger); padding-left: 2px; }
        .input-err { border-color: var(--danger) !important; box-shadow: 0 0 0 3px rgba(248,113,113,0.18) !important; }

        .purity-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .purity-presets { display: flex; gap: 6px; flex-shrink: 0; }
        .preset-btn {
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--stroke);
          background: var(--surface);
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .preset-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--text-strong); }
        /* Активная проба: белый текст на мягком красном — иначе красное на красном рябит (правка Руслана). */
        .preset-btn.active { background: var(--gold-soft); border-color: var(--gold); color: var(--text-strong); }
        .preset-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .purity-select {
          flex: 0 0 auto;
          min-width: 7.2rem;
          max-width: 9rem;
          appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path fill='%239099a3' d='M1 1l5 5 5-5'/></svg>");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px;
        }

        .hint-loading { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 0.82rem; }
        .warn-box { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); font-size: 0.82rem; padding: 10px 12px; border-radius: var(--radius-sm); margin: 0 0 12px; line-height: 1.4; }
        .err { color: var(--danger); font-size: 0.85rem; margin: 0 0 12px; padding: 8px 12px; background: rgba(248,113,113,0.08); border-radius: var(--radius-sm); border: 1px solid rgba(248,113,113,0.25); }
        .calc-btn { width: 100%; transition: transform 0.15s, box-shadow 0.15s, filter 0.15s, opacity 0.2s; }
        .calc-btn--ready { animation: btnPulse 2.5s ease infinite; }
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 4px 24px var(--gold-glow); }
          50% { box-shadow: 0 4px 32px var(--accent-glow); }
        }
        .result-block { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--stroke); }
        .result-enter { animation: resultIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes resultIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        .result-row { display: flex; justify-content: space-between; margin-bottom: 8px; gap: 12px; }
        .result-hero { margin-top: 16px; text-align: center; padding: 18px 14px; border-radius: var(--radius-sm); background: var(--gold-soft); border: 1px solid var(--stroke); }
        .result-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; display: block; margin-bottom: 8px; }
        .result-range { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--text-strong); margin: 0 0 6px; line-height: 1.25; word-break: break-word; }
        .result-range .dash { color: var(--text-muted); font-weight: 400; }
        .result-mid { display: block; }

        .result-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }
        .btn-copy {
          display: block;
          width: 100%;
          padding: 11px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--stroke);
          background: transparent;
          color: var(--text-muted);
          font-size: 0.85rem;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .btn-copy:hover { border-color: var(--gold); color: var(--gold); }
        .btn-copy--done { border-color: #4ade80; color: #4ade80; background: rgba(74,222,128,0.06); }
        .btn-contract {
          display: block;
          width: 100%;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--gold);
          background: linear-gradient(180deg, var(--gold-soft), var(--accent-soft));
          color: var(--text-strong);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.12s, box-shadow 0.15s;
        }
        .btn-contract:hover {
          box-shadow: 0 4px 20px var(--gold-glow);
        }
        .btn-contract:active { transform: scale(0.99); }

        .btn-show-client {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--emerald);
          background: var(--emerald-soft);
          color: var(--emerald);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.12s, box-shadow 0.18s, background 0.18s;
        }
        .btn-show-client:hover {
          background: var(--emerald);
          color: #fff;
          box-shadow: 0 4px 20px rgba(30, 107, 79, 0.3);
        }
        .btn-show-client:active { transform: scale(0.98); }
        .btn-show-client:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; }

        @media (max-width: 380px) {
          .calc-card { padding: 18px 14px 20px; }
          .result-range { font-size: 1.2rem; }
          .result-range .dash { display: block; margin: 4px 0; font-size: 0.9rem; }
          .preset-btn { padding: 10px 10px; font-size: 0.85rem; }
        }
      `}</style>
    </div>
  );
}
