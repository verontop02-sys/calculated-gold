import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

export function Calculator({ formatMoney, price }) {
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [purity, setPurity] = useState('585');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSettingsLoading(true);
    api
      .settings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setSettingsLoading(false));
  }, []);

  const purityOptions = useMemo(() => {
    const order = settings?.purityOrder || [375, 500, 583, 585, 750, 875, 916, 958, 999];
    return order.map(String);
  }, [settings]);

  async function runCalc() {
    setErr('');
    setLoading(true);
    setResult(null);
    try {
      const w = parseFloat(String(weight).replace(',', '.'));
      const p = parseInt(purity, 10);
      const r = await api.calculate(w, p);
      setResult(r);
    } catch (ex) {
      setErr(ex.body?.error || ex.message);
    } finally {
      setLoading(false);
    }
  }

  const canCalc = price?.goldRubPerGram != null;

  return (
    <div className="calc">
      <div className="glass calc-card">
        <h2 className="calc-heading">Расчёт выкупа</h2>
        <p className="calc-hint muted">Укажите вес изделия и пробу. Система использует котировку ЦБ и ваши коэффициенты из настроек.</p>
        <div className="fields">
          <label className="field">
            <span className="field-label">Вес, г</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="например 7.42" disabled={settingsLoading} />
          </label>
          <label className="field">
            <span className="field-label">Проба</span>
            <select value={purity} onChange={(e) => setPurity(e.target.value)} disabled={settingsLoading}>
              {purityOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        {settingsLoading && (
          <p className="hint-loading muted small">
            <span className="spinner inline" /> Загружаем коэффициенты…
          </p>
        )}
        {!canCalc && !settingsLoading && <p className="warn-box">Курс недоступен. Дождитесь обновления или попросите администратора обновить вручную.</p>}
        {err && <p className="err">{err}</p>}
        <button
          type="button"
          className="btn-primary calc-btn"
          disabled={loading || !canCalc || settingsLoading}
          onClick={runCalc}
        >
          {loading ? (
            <>
              <span className="spinner inline" /> Считаем…
            </>
          ) : (
            'Рассчитать'
          )}
        </button>

        {result && (
          <div className="result-block">
            <div className="result-row muted small">
              <span>Чистого золота</span>
              <span className="mono-nums">{result.fineGrams.toFixed(3)} г</span>
            </div>
            <div className="result-row muted small">
              <span>Ломовая (по ЦБ)</span>
              <span className="mono-nums">{formatMoney(result.scrapRub)}</span>
            </div>
            <div className="result-hero">
              <span className="result-label muted">Диапазон выкупа</span>
              <p className="result-range mono-nums">
                {formatMoney(result.lowRub)}
                <span className="dash"> — </span>
                {formatMoney(result.highRub)}
              </p>
              <span className="result-mid muted small">ориентир: {formatMoney(result.midRub)}</span>
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
        .hint-loading { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 0.82rem; }
        .warn-box { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); font-size: 0.82rem; padding: 10px 12px; border-radius: var(--radius-sm); margin: 0 0 12px; line-height: 1.4; }
        .err { color: var(--danger); font-size: 0.85rem; margin: 0 0 12px; }
        .calc-btn { width: 100%; }
        .result-block { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--stroke); }
        .result-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .result-hero { margin-top: 16px; text-align: center; padding: 18px 14px; border-radius: var(--radius-sm); background: var(--gold-soft); border: 1px solid var(--stroke); }
        .result-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.14em; display: block; margin-bottom: 8px; }
        .result-range { font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--gold); margin: 0 0 6px; line-height: 1.25; }
        .result-range .dash { color: var(--text-muted); font-weight: 400; }
        .result-mid { display: block; }
      `}</style>
    </div>
  );
}
