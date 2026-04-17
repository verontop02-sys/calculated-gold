import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { calculateBuybackRange } from './calc.js';

const PRESETS = ['585', '750', '999'];

function calcLocalKeys(userUid) {
  const id = userUid && String(userUid).trim() ? String(userUid).replace(/[^a-zA-Z0-9-]/g, '') : '';
  const suffix = id || 'anon';
  return { weight: `cg_weight__${suffix}`, purity: `cg_purity__${suffix}` };
}

function quoteRowLabel(price) {
  if (!price) return 'По курсу чистого золота';
  if (price.source === 'xaut') return 'По курсу XAUT (USD→₽, ЦБ), чистое золото';
  if (price.source === 'moex') return 'По курсу Мосбиржи (чистое золото)';
  if (price.fallbackFrom === 'moex') return 'По курсу ЦБ, резерв (чистое золото)';
  return 'По курсу ЦБ (чистое золото)';
}

export function Calculator({ formatMoney, price, userUid, onGoToContract }) {
  const lsKeys = useMemo(() => calcLocalKeys(userUid), [userUid]);

  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [weightErr, setWeightErr] = useState('');
  const [purity, setPurity] = useState('585');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [justCalced, setJustCalced] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);

  useEffect(() => {
    setWeight(localStorage.getItem(lsKeys.weight) || '');
    setPurity(localStorage.getItem(lsKeys.purity) || '585');
    setWeightErr('');
    setResult(null);
    setErr('');
    setJustCalced(false);
    setCopied(false);
  }, [lsKeys.weight, lsKeys.purity]);

  useEffect(() => {
    setSettingsLoading(true);
    api
      .settings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setSettingsLoading(false));
  }, []);

  const purityOptions = useMemo(() => {
    const order = settings?.purityOrder || [375, 500, 583, 585, 750, 875, 900, 916, 958, 999];
    const nums = [...new Set(order.map((p) => Number(p)).filter((p) => Number.isFinite(p)))];
    if (!nums.includes(900)) {
      const idx875 = nums.indexOf(875);
      if (idx875 >= 0) nums.splice(idx875 + 1, 0, 900);
      else nums.push(900);
    }
    return nums.map(String);
  }, [settings]);

  const canCalc = price?.goldRubPerGram != null && !settingsLoading;

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
      goldRubPerGram: price.goldRubPerGram,
      settings,
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
    const text =
      `Расчёт выкупа золота\n` +
      `Вес: ${weight} г, проба ${purity}\n` +
      `Чистого золота: ${result.fineGrams.toFixed(3)} г\n` +
      `${quoteRowLabel(price)}: ${formatMoney(result.scrapRub)}\n` +
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
      <div className="glass calc-card">
        <h2 className="calc-heading">Расчёт выкупа</h2>
        <p className="calc-hint muted">
          Укажите вес изделия и пробу. Курс чистого золота в верхней панели, коэффициенты в настройках.
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
                value={purity}
                onChange={handlePurityChange}
                disabled={settingsLoading}
                className="purity-select"
                title="Все пробы"
              >
                {purityOptions.map((p) => (
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
            Не удалось загрузить настройки. Расчёт может быть неточным.
          </p>
        )}

        {!canCalc && !settingsLoading && price?.goldRubPerGram == null && (
          <p className="warn-box">
            Курс недоступен. Дождитесь обновления или попросите администратора обновить вручную.
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
              <span>Чистого золота</span>
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
                      itemName: 'Лом ювелирных изделий',
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

        .purity-row { display: flex; gap: 8px; align-items: center; }
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
        .preset-btn:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
        .preset-btn.active { background: var(--gold-soft); border-color: var(--gold); color: var(--gold); }
        .preset-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .purity-select { flex: 1; min-width: 0; }

        .hint-loading { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 0.82rem; }
        .warn-box { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); font-size: 0.82rem; padding: 10px 12px; border-radius: var(--radius-sm); margin: 0 0 12px; line-height: 1.4; }
        .err { color: var(--danger); font-size: 0.85rem; margin: 0 0 12px; padding: 8px 12px; background: rgba(248,113,113,0.08); border-radius: var(--radius-sm); border: 1px solid rgba(248,113,113,0.25); }
        .calc-btn { width: 100%; transition: transform 0.15s, box-shadow 0.15s, filter 0.15s, opacity 0.2s; }
        .calc-btn--ready { animation: btnPulse 2.5s ease infinite; }
        @keyframes btnPulse {
          0%, 100% { box-shadow: 0 4px 24px var(--gold-glow); }
          50% { box-shadow: 0 4px 32px rgba(232,197,71,0.55); }
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
        .result-range { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--gold); margin: 0 0 6px; line-height: 1.25; word-break: break-word; }
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
          background: linear-gradient(180deg, var(--gold-soft), rgba(232,197,71,0.12));
          color: var(--gold);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.12s, box-shadow 0.15s;
        }
        .btn-contract:hover {
          box-shadow: 0 4px 20px var(--gold-glow);
        }
        .btn-contract:active { transform: scale(0.99); }

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
