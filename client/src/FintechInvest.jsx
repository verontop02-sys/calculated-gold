import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fintechApi, getFintechToken, setFintechToken } from './api.js';
import { openFintechStatementReport } from './fintechStatementReport.js';

const STATUS_LABELS = {
  new: 'Новый',
  pending_review: 'На проверке',
  approved: 'Подтверждён',
  rejected: 'Отклонён',
  blocked: 'Блокирован',
};

const DOC_LABELS = {
  passport_main: 'Паспорт (разворот с фото)',
  passport_registration: 'Паспорт (страница с регистрацией)',
  selfie: 'Селфи с паспортом',
};

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}
function formatGrams(n) {
  if (n == null || !Number.isFinite(Number(n))) return '0.0000 г';
  return `${Number(n).toFixed(4)} г`;
}
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Инвестиции в золото — отдельный fintech-модуль внутри общего /kabinet.
 * Своя сессия (телефон+SMS), отдельная от кабинета скупки: разные бизнес-линии.
 */
export function FintechInvest({ initialPhone = '' }) {
  const [phase, setPhase] = useState('checking'); // checking | login | app
  const [profile, setProfile] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  const loadProfile = useCallback(async () => {
    try {
      const p = await fintechApi.profile();
      setProfile(p);
      setPhase('app');
      setLoadErr('');
    } catch (e) {
      if (e?.status === 401) {
        setFintechToken('');
        setPhase('login');
      } else {
        setLoadErr(e?.message || 'Не удалось загрузить кабинет');
        setPhase('app');
      }
    }
  }, []);

  useEffect(() => {
    if (!getFintechToken()) {
      setPhase('login');
      return;
    }
    loadProfile();
  }, [loadProfile]);

  // Пока документы на проверке — тихо обновляем статус, чтобы не заставлять жать «Обновить».
  useEffect(() => {
    if (profile?.status !== 'pending_review') return undefined;
    const id = setInterval(() => { void loadProfile(); }, 20_000);
    return () => clearInterval(id);
  }, [profile?.status, loadProfile]);

  if (phase === 'login') {
    return <FintechLogin initialPhone={initialPhone} onDone={loadProfile} />;
  }

  if (phase === 'checking') {
    return <div className="fin-card fin-center"><span className="fin-spinner" /> Загрузка…</div>;
  }

  if (loadErr) {
    return (
      <div className="fin-card fin-err-card">
        <p className="fin-err">{loadErr}</p>
        <button type="button" className="fin-btn" onClick={loadProfile}>Повторить</button>
        <style>{CSS}</style>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="fin-root">
      {(profile.status === 'new' || profile.status === 'rejected') && (
        <FintechOnboarding profile={profile} onUpdated={loadProfile} />
      )}
      {profile.status === 'pending_review' && <FintechPendingReview profile={profile} onRefresh={loadProfile} />}
      {profile.status === 'blocked' && (
        <div className="fin-card fin-err-card">
          <p className="fin-err">Доступ к инвестициям заблокирован. Обратитесь к менеджеру Reaktivo.</p>
        </div>
      )}
      {profile.status === 'approved' && <FintechDashboard profile={profile} />}
      <style>{CSS}</style>
    </div>
  );
}

// ── Вход (телефон + SMS-код) ───────────────────────────────────────────────
function FintechLogin({ initialPhone, onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(initialPhone || '');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState('');
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => setResendIn((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const phoneDigits = phone.replace(/\D/g, '').replace(/^8/, '').replace(/^7/, '').slice(0, 10);

  async function requestCode(e) {
    e?.preventDefault?.();
    setErr('');
    if (phoneDigits.length !== 10) {
      setErr('Введите номер телефона полностью');
      return;
    }
    setBusy(true);
    try {
      const out = await fintechApi.requestCode(`7${phoneDigits}`);
      setPhoneMasked(out.phoneMasked || '');
      setStep('code');
      setResendIn(60);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e?.preventDefault?.();
    setErr('');
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) {
      setErr('Введите 6 цифр из СМС');
      return;
    }
    setBusy(true);
    try {
      await fintechApi.verify(`7${phoneDigits}`, c);
      onDone?.();
    } catch (e2) {
      setErr(e2?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fin-card fin-login">
      <h2 className="fin-h2">Инвестиции в золото</h2>
      <p className="fin-sub">
        Отдельный вход — на всякий случай, чтобы доступ к деньгам защищал свой код,
        даже если сессия кабинета скупки уже открыта на этом телефоне.
      </p>

      {step === 'phone' && (
        <form onSubmit={requestCode} className="fin-form">
          <label className="fin-field">
            <span className="fin-field-label">Номер телефона</span>
            <div className="fin-phone">
              <span className="fin-phone-prefix">+7</span>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={phoneDigits}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9990000000"
                autoFocus
              />
            </div>
          </label>
          {err && <p className="fin-err">{err}</p>}
          <button type="submit" className="fin-btn" disabled={busy}>
            {busy ? <><span className="fin-spinner" /> Отправляем…</> : 'Получить код'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="fin-form">
          <p className="fin-code-hint">Код отправлен на {phoneMasked || 'ваш номер'}.</p>
          <label className="fin-field">
            <span className="fin-field-label">Код из SMS</span>
            <input
              className="fin-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
            />
          </label>
          {err && <p className="fin-err">{err}</p>}
          <button type="submit" className="fin-btn" disabled={busy}>
            {busy ? <><span className="fin-spinner" /> Проверяем…</> : 'Войти'}
          </button>
          <div className="fin-code-actions">
            <button type="button" className="fin-link" onClick={() => { setStep('phone'); setCode(''); setErr(''); }}>
              Изменить номер
            </button>
            <button type="button" className="fin-link" disabled={resendIn > 0 || busy} onClick={requestCode}>
              {resendIn > 0 ? `Отправить ещё раз через ${resendIn}с` : 'Отправить код ещё раз'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Регистрация: контакты + загрузка документов ─────────────────────────────
function FintechOnboarding({ profile, onUpdated }) {
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [email, setEmail] = useState(profile.email || '');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const docsByType = useMemo(() => {
    const map = new Map();
    for (const d of profile.documents || []) {
      if (!map.has(d.docType) || new Date(d.createdAt) > new Date(map.get(d.docType).createdAt)) {
        map.set(d.docType, d);
      }
    }
    return map;
  }, [profile.documents]);

  async function saveInfo(e) {
    e?.preventDefault?.();
    setSavingInfo(true);
    setErr('');
    try {
      await fintechApi.updateProfile(fullName, email);
      setInfoSaved(true);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось сохранить данные');
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleUpload(docType, file) {
    if (!file) return;
    setErr('');
    setUploading(docType);
    try {
      const dataUrl = await fileToBase64(file);
      await fintechApi.uploadKycDoc(docType, dataUrl, file.type);
      await onUpdated?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось загрузить файл');
    } finally {
      setUploading('');
    }
  }

  const hasRequired = docsByType.has('passport_main') && docsByType.has('selfie')
    && docsByType.get('passport_main').status !== 'rejected'
    && docsByType.get('selfie').status !== 'rejected';

  async function submit() {
    setSubmitting(true);
    setErr('');
    try {
      await fintechApi.submitForReview();
      await onUpdated?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить на проверку');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fin-onboarding">
      {profile.status === 'rejected' && profile.rejectReason && (
        <div className="fin-card fin-reject-banner">
          <span className="fin-reject-title">Заявка отклонена</span>
          <p>{profile.rejectReason}</p>
          <p className="fin-muted">Загрузите документы ещё раз — заявка автоматически уйдёт на повторную проверку.</p>
        </div>
      )}

      <div className="fin-card">
        <h2 className="fin-h2">Данные для регистрации</h2>
        <form onSubmit={saveInfo} className="fin-form fin-form--row">
          <label className="fin-field">
            <span className="fin-field-label">ФИО</span>
            <input value={fullName} onChange={(e) => { setFullName(e.target.value); setInfoSaved(false); }} placeholder="Иванов Иван Иванович" />
          </label>
          <label className="fin-field">
            <span className="fin-field-label">Email (для выписок)</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInfoSaved(false); }} placeholder="you@example.com" />
          </label>
          <button type="submit" className="fin-btn fin-btn--sm" disabled={savingInfo}>
            {savingInfo ? <span className="fin-spinner" /> : infoSaved ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </form>
      </div>

      <div className="fin-card">
        <h2 className="fin-h2">Документы (KYC)</h2>
        <p className="fin-sub">Загрузите фото или скан — модератор проверит их вручную.</p>
        <div className="fin-docs">
          {Object.keys(DOC_LABELS).map((docType) => {
            const doc = docsByType.get(docType);
            return (
              <DocUploadRow
                key={docType}
                docType={docType}
                label={DOC_LABELS[docType]}
                required={docType !== 'passport_registration'}
                doc={doc}
                uploading={uploading === docType}
                onUpload={(file) => handleUpload(docType, file)}
              />
            );
          })}
        </div>
        {err && <p className="fin-err">{err}</p>}
        <button type="button" className="fin-btn" disabled={!hasRequired || submitting} onClick={submit}>
          {submitting ? <><span className="fin-spinner" /> Отправляем…</> : 'Отправить на проверку'}
        </button>
        {!hasRequired && <p className="fin-hint">Загрузите паспорт (разворот) и селфи с паспортом.</p>}
      </div>
    </div>
  );
}

function DocUploadRow({ docType, label, required, doc, uploading, onUpload }) {
  const inputRef = useRef(null);
  const status = doc?.status;
  return (
    <div className="fin-doc-row">
      <div className="fin-doc-main">
        <span className="fin-doc-label">{label}{required ? '' : ' (опционально)'}</span>
        {status && (
          <span className={`fin-doc-badge fin-doc-badge--${status}`}>
            {status === 'approved' ? 'Одобрено' : status === 'rejected' ? 'Отклонено' : 'На проверке'}
          </span>
        )}
        {status === 'rejected' && doc?.rejectReason && <span className="fin-doc-reason">{doc.rejectReason}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }}
      />
      <button type="button" className="fin-doc-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <span className="fin-spinner" /> : status ? 'Загрузить ещё раз' : 'Загрузить'}
      </button>
    </div>
  );
}

// ── Ожидание проверки ───────────────────────────────────────────────────────
function FintechPendingReview({ profile, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try { await onRefresh?.(); } finally { setRefreshing(false); }
  }
  return (
    <div className="fin-card fin-center fin-pending">
      <span className="fin-pending-icon" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
      <h2 className="fin-h2">Документы на проверке</h2>
      <p className="fin-sub">Модератор Reaktivo проверяет ваши документы. Обычно это занимает до 1 рабочего дня.</p>
      <div className="fin-doc-status-list">
        {(profile.documents || []).map((d) => (
          <div key={d.id} className="fin-doc-status-row">
            <span>{DOC_LABELS[d.docType] || d.docType}</span>
            <span className={`fin-doc-badge fin-doc-badge--${d.status}`}>
              {d.status === 'approved' ? 'Одобрено' : d.status === 'rejected' ? 'Отклонено' : 'На проверке'}
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="fin-btn fin-btn--sm" disabled={refreshing} onClick={refresh}>
        {refreshing ? <span className="fin-spinner" /> : 'Обновить статус'}
      </button>
    </div>
  );
}

// ── Дашборд после одобрения ─────────────────────────────────────────────────
function FintechDashboard({ profile }) {
  const [portfolio, setPortfolio] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('rub'); // 'rub' | 'grams'
  const [amount, setAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const [buyOk, setBuyOk] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [p, l] = await Promise.all([fintechApi.portfolio(), fintechApi.ledger(100)]);
      setPortfolio(p);
      setLedger(l.entries || []);
    } catch (e) {
      setErr(e?.message || 'Не удалось загрузить портфель');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const estimate = useMemo(() => {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || !portfolio?.currentRatePerGram) return null;
    const feeMult = 1.015; // ориентир — точная комиссия считается на сервере
    if (mode === 'rub') {
      return { grams: v / (portfolio.currentRatePerGram * feeMult) };
    }
    return { rub: v * portfolio.currentRatePerGram * feeMult };
  }, [amount, mode, portfolio?.currentRatePerGram]);

  async function submitBuy(e) {
    e.preventDefault();
    setBuyErr('');
    setBuyOk('');
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setBuyErr('Укажите сумму или вес больше нуля');
      return;
    }
    setBuying(true);
    try {
      const payload = mode === 'rub'
        ? { rubAmount: v, idempotencyKey: crypto.randomUUID() }
        : { grams: v, idempotencyKey: crypto.randomUUID() };
      const out = await fintechApi.buy(payload);
      setBuyOk(`Куплено ${formatGrams(out.gramsBought)} за ${formatMoney(out.rubSpent)}`);
      setAmount('');
      await load();
    } catch (e2) {
      setBuyErr(e2?.message || 'Не удалось выполнить покупку');
    } finally {
      setBuying(false);
    }
  }

  async function downloadStatement() {
    setPdfBusy(true);
    try {
      await openFintechStatementReport({
        clientName: profile.fullName,
        phoneMasked: profile.phoneMasked,
        portfolio,
        entries: ledger,
      });
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) return <div className="fin-card fin-center"><span className="fin-spinner" /> Загружаем портфель…</div>;
  if (err) return <div className="fin-card fin-err-card"><p className="fin-err">{err}</p><button type="button" className="fin-btn" onClick={load}>Повторить</button></div>;

  return (
    <div className="fin-dashboard">
      <div className="fin-kpis">
        <div className="fin-kpi fin-kpi--hero">
          <span className="fin-kpi-label">Золото на счёте</span>
          <span className="fin-kpi-value">{formatGrams(portfolio?.goldGrams)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">Стоимость портфеля</span>
          <span className="fin-kpi-value">{formatMoney(portfolio?.marketValueRub)}</span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">Вложено</span>
          <span className="fin-kpi-value">{formatMoney(portfolio?.investedRub)}</span>
        </div>
        <div className={`fin-kpi ${(portfolio?.pnlRub ?? 0) >= 0 ? 'fin-kpi--pos' : 'fin-kpi--neg'}`}>
          <span className="fin-kpi-label">Доход</span>
          <span className="fin-kpi-value">
            {formatMoney(portfolio?.pnlRub)}
            {portfolio?.pnlPercent != null && <span className="fin-kpi-pct"> ({portfolio.pnlPercent > 0 ? '+' : ''}{portfolio.pnlPercent}%)</span>}
          </span>
        </div>
        <div className="fin-kpi">
          <span className="fin-kpi-label">Рублёвый баланс</span>
          <span className="fin-kpi-value">{formatMoney(portfolio?.rubBalance)}</span>
        </div>
      </div>

      <div className="fin-card fin-topup-hint">
        <span className="fin-topup-icon" aria-hidden>ℹ</span>
        <p>
          Пополнение — банковским переводом по реквизитам Reaktivo (уточните у менеджера).
          После поступления средств баланс пополнит модератор — обычно в течение рабочего дня.
        </p>
      </div>

      <div className="fin-card">
        <h2 className="fin-h2">Купить золото</h2>
        <form onSubmit={submitBuy} className="fin-buy-form">
          <div className="fin-mode-switch">
            <button type="button" className={`fin-mode-btn${mode === 'rub' ? ' fin-mode-btn--on' : ''}`} onClick={() => { setMode('rub'); setAmount(''); }}>В рублях</button>
            <button type="button" className={`fin-mode-btn${mode === 'grams' ? ' fin-mode-btn--on' : ''}`} onClick={() => { setMode('grams'); setAmount(''); }}>В граммах</button>
          </div>
          <label className="fin-field">
            <span className="fin-field-label">{mode === 'rub' ? 'Сумма, ₽' : 'Вес, г'}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === 'rub' ? 'например 10000' : 'например 1.5'}
            />
          </label>
          {estimate && (
            <p className="fin-estimate">
              {mode === 'rub' ? `≈ ${formatGrams(estimate.grams)}` : `≈ ${formatMoney(estimate.rub)}`}
              <span className="fin-muted"> (ориентир, точная сумма — при подтверждении)</span>
            </p>
          )}
          {buyErr && <p className="fin-err">{buyErr}</p>}
          {buyOk && <p className="fin-ok">{buyOk}</p>}
          <button type="submit" className="fin-btn" disabled={buying}>
            {buying ? <><span className="fin-spinner" /> Покупаем…</> : 'Купить'}
          </button>
        </form>
      </div>

      <div className="fin-card">
        <div className="fin-history-head">
          <h2 className="fin-h2">История операций</h2>
          <button type="button" className="fin-link" disabled={pdfBusy} onClick={downloadStatement}>
            {pdfBusy ? 'Готовим PDF…' : 'Скачать выписку (PDF)'}
          </button>
        </div>
        {ledger.length === 0 && <p className="fin-muted">Операций пока нет.</p>}
        {ledger.map((e) => (
          <div key={e.id} className="fin-ledger-row">
            <div className="fin-ledger-main">
              <span className="fin-ledger-type">{ENTRY_LABEL(e.entryType)}</span>
              <span className="fin-ledger-date">{formatDateTime(e.createdAt)}</span>
            </div>
            <div className="fin-ledger-right">
              {!!e.rubDelta && <span className={e.rubDelta > 0 ? 'fin-pos' : 'fin-neg'}>{e.rubDelta > 0 ? '+' : ''}{formatMoney(e.rubDelta)}</span>}
              {!!e.goldGramsDelta && <span className={e.goldGramsDelta > 0 ? 'fin-pos' : 'fin-neg'}>{e.goldGramsDelta > 0 ? '+' : ''}{formatGrams(e.goldGramsDelta)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ENTRY_LABEL(t) {
  return ({
    deposit_rub: 'Пополнение',
    withdraw_rub: 'Вывод',
    buy_gold: 'Покупка золота',
    sell_gold: 'Продажа золота',
    fee: 'Комиссия',
    correction: 'Корректировка',
  })[t] || t;
}

const CSS = `
.fin-root { display: flex; flex-direction: column; gap: 14px; }
.fin-onboarding, .fin-dashboard { display: flex; flex-direction: column; gap: 14px; }
.fin-card {
  background: var(--cpx-panel, #fff);
  border: 1px solid var(--cpx-stroke, #e6e8ec);
  border-radius: 18px;
  padding: 22px 20px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.12);
}
.fin-center { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 40px 20px; }
.fin-h2 { font-family: var(--font-display, serif); font-size: 1.2rem; font-weight: 700; margin: 0 0 6px; color: var(--cpx-ink, #1a1d23); }
.fin-sub { margin: 0 0 16px; font-size: 0.85rem; line-height: 1.5; color: var(--cpx-muted, #6b7280); }
.fin-muted { color: var(--cpx-muted, #6b7280); font-size: 0.82rem; }
.fin-err { color: #d14343; font-size: 0.85rem; margin: 8px 0; }
.fin-ok { color: #1e6b4f; font-size: 0.85rem; margin: 8px 0; font-weight: 600; }
.fin-err-card { align-items: center; gap: 12px; }

.fin-login { max-width: 440px; margin: 12px auto; }
.fin-form { display: flex; flex-direction: column; gap: 12px; }
.fin-form--row { flex-direction: row; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.fin-form--row .fin-field { flex: 1; min-width: 180px; }
.fin-field { display: flex; flex-direction: column; gap: 6px; }
.fin-field-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; color: var(--cpx-muted, #6b7280); }
.fin-field input, .fin-phone input {
  width: 100%; padding: 12px 14px; border-radius: 11px; border: 1px solid var(--cpx-stroke, #e6e8ec);
  font-size: 0.95rem; color: var(--cpx-ink, #1a1d23); background: #fff; box-sizing: border-box; outline: none;
}
.fin-field input:focus, .fin-phone input:focus { border-color: var(--cpx-accent, #b8893a); }
.fin-phone { display: flex; gap: 8px; }
.fin-phone-prefix { display: flex; align-items: center; padding: 0 12px; border-radius: 11px; border: 1px solid var(--cpx-stroke, #e6e8ec); background: #f6f7f9; font-weight: 700; }
.fin-phone input { flex: 1; }
.fin-code-input { letter-spacing: 0.45em; font-size: 1.3rem; text-align: center; font-weight: 700; }
.fin-code-hint { margin: 0; font-size: 0.85rem; color: var(--cpx-muted, #6b7280); }
.fin-code-actions { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.fin-link { background: none; border: none; color: var(--cpx-accent, #b8893a); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; }
.fin-link:disabled { color: var(--cpx-muted, #6b7280); cursor: not-allowed; }

.fin-btn {
  width: 100%; padding: 13px 18px; border: none; border-radius: 12px;
  background: linear-gradient(135deg, #c79544, #a9772b); color: #fff; font-size: 0.92rem; font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.fin-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.fin-btn--sm { width: auto; padding: 10px 16px; flex-shrink: 0; }

.fin-reject-banner { border-color: #f1c0c0; background: #fdf3f3; }
.fin-reject-title { font-weight: 700; color: #b23c3c; }

.fin-docs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.fin-doc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--cpx-stroke, #e6e8ec); flex-wrap: wrap; }
.fin-doc-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fin-doc-label { font-size: 0.88rem; font-weight: 600; }
.fin-doc-reason { font-size: 0.78rem; color: #b23c3c; }
.fin-doc-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; width: fit-content; }
.fin-doc-badge--pending { background: #fff3d6; color: #8a6300; }
.fin-doc-badge--approved { background: #e3f5ea; color: #1e6b4f; }
.fin-doc-badge--rejected { background: #fdeaea; color: #b23c3c; }
.fin-doc-btn { padding: 9px 14px; border-radius: 10px; border: 1px solid var(--cpx-accent, #b8893a); background: transparent; color: var(--cpx-accent, #b8893a); font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.fin-doc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.fin-hint { font-size: 0.8rem; color: var(--cpx-muted, #6b7280); margin-top: 10px; text-align: center; }

.fin-pending { max-width: 520px; margin: 0 auto; }
.fin-pending-icon { color: var(--cpx-accent, #b8893a); }
.fin-doc-status-list { width: 100%; display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
.fin-doc-status-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding: 8px 12px; border-radius: 10px; background: #f6f7f9; }

.fin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.fin-kpi { background: var(--cpx-panel, #fff); border: 1px solid var(--cpx-stroke, #e6e8ec); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.fin-kpi--hero { background: linear-gradient(135deg, rgba(184,137,58,0.14), rgba(184,137,58,0.04)); border-color: rgba(184,137,58,0.3); }
.fin-kpi--pos .fin-kpi-value { color: #1e6b4f; }
.fin-kpi--neg .fin-kpi-value { color: #d14343; }
.fin-kpi-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cpx-muted, #6b7280); font-weight: 700; }
.fin-kpi-value { font-size: 1.15rem; font-weight: 700; color: var(--cpx-ink, #1a1d23); }
.fin-kpi-pct { font-size: 0.78rem; font-weight: 600; }

.fin-topup-hint { display: flex; align-items: flex-start; gap: 10px; background: #f6f4ee; border-color: rgba(184,137,58,0.25); }
.fin-topup-icon { color: var(--cpx-accent, #b8893a); font-weight: 700; }
.fin-topup-hint p { margin: 0; font-size: 0.84rem; color: var(--cpx-ink, #1a1d23); line-height: 1.5; }

.fin-buy-form { display: flex; flex-direction: column; gap: 12px; max-width: 380px; }
.fin-mode-switch { display: flex; gap: 8px; background: #f6f7f9; padding: 4px; border-radius: 11px; }
.fin-mode-btn { flex: 1; padding: 9px 12px; border: none; border-radius: 8px; background: transparent; color: var(--cpx-muted, #6b7280); font-weight: 600; font-size: 0.85rem; cursor: pointer; }
.fin-mode-btn--on { background: #fff; color: var(--cpx-ink, #1a1d23); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.fin-estimate { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--cpx-gold, #a9772b); }

.fin-history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.fin-history-head .fin-h2 { margin: 0; }
.fin-ledger-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--cpx-stroke, #e6e8ec); font-size: 0.85rem; }
.fin-ledger-row:last-child { border-bottom: none; }
.fin-ledger-main { display: flex; flex-direction: column; gap: 2px; }
.fin-ledger-type { font-weight: 600; }
.fin-ledger-date { font-size: 0.75rem; color: var(--cpx-muted, #6b7280); }
.fin-ledger-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.fin-pos { color: #1e6b4f; font-weight: 600; }
.fin-neg { color: #d14343; font-weight: 600; }

.fin-spinner { width: 1em; height: 1em; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; display: inline-block; animation: finSpin 0.7s linear infinite; flex-shrink: 0; }
@keyframes finSpin { to { transform: rotate(360deg); } }
`;
