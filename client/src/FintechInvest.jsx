import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fintechApi, getFintechToken, setFintechToken } from './api.js';
import { openFintechStatementReport } from './fintechStatementReport.js';

const DOC_LABELS = {
  passport_main: 'Паспорт (разворот с фото)',
  passport_registration: 'Паспорт (страница с регистрацией)',
  selfie: 'Селфи с паспортом',
};

const ENTRY_LABELS = {
  deposit_rub: 'Пополнение',
  withdraw_rub: 'Вывод',
  buy_gold: 'Покупка золота',
  sell_gold: 'Продажа золота',
  fee: 'Комиссия',
  correction: 'Корректировка',
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

function formatPhoneInput(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^8/, '7').replace(/^7/, '');
  return d.slice(0, 10);
}

/**
 * Инвестиции в золото — отдельный fintech-модуль внутри общего /kabinet.
 * Своя сессия (телефон+SMS), отдельная от кабинета скупки: разные бизнес-линии.
 * Дизайн переиспользует общие cpx-* стили кабинета (см. ClientPortal.jsx) —
 * никакой отдельной темы/CSS-блока здесь нет, чтобы вкладка не выглядела чужой.
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
    return <div className="cpx-center"><span className="cpx-spinner" /> Загрузка…</div>;
  }

  if (loadErr) {
    return (
      <div className="cpx-card">
        <p className="cpx-err">{loadErr}</p>
        <button type="button" className="cpx-btn cpx-btn--sm" onClick={loadProfile}>Повторить</button>
      </div>
    );
  }

  if (!profile) return null;

  if (profile.status === 'new' || profile.status === 'rejected') {
    return <FintechOnboarding profile={profile} onUpdated={loadProfile} />;
  }
  if (profile.status === 'pending_review') {
    return <FintechPendingReview profile={profile} onRefresh={loadProfile} />;
  }
  if (profile.status === 'blocked') {
    return (
      <div className="cpx-card">
        <p className="cpx-err">Доступ к инвестициям заблокирован. Обратитесь к менеджеру Reaktivo.</p>
      </div>
    );
  }
  return <FintechDashboard profile={profile} />;
}

// ── Вход (телефон + SMS-код) — 1 в 1 с главным логином кабинета ────────────
function FintechLogin({ initialPhone, onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(formatPhoneInput(initialPhone));
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

  async function requestCode(e) {
    e?.preventDefault?.();
    setErr('');
    if (phone.length !== 10) {
      setErr('Введите номер телефона полностью');
      return;
    }
    setBusy(true);
    try {
      const out = await fintechApi.requestCode(`7${phone}`);
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
      await fintechApi.verify(`7${phone}`, c);
      onDone?.();
    } catch (e2) {
      setErr(e2?.message || 'Неверный код');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cpx-card cpx-login">
      <h1 className="cpx-title">Инвестиции в золото</h1>
      <p className="cpx-sub">
        Отдельный вход — свой код защищает доступ к деньгам, даже если сессия кабинета скупки уже открыта на этом телефоне.
      </p>

      {step === 'phone' && (
        <form onSubmit={requestCode} className="cpx-form">
          <label className="cpx-field">
            <span className="cpx-field-label">Номер телефона</span>
            <div className="cpx-phone">
              <span className="cpx-phone-prefix">+7</span>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="9990000000"
                autoFocus
              />
            </div>
          </label>
          {err && <p className="cpx-err">{err}</p>}
          <button type="submit" className="cpx-btn" disabled={busy}>
            {busy ? <><span className="cpx-spinner" /> Отправляем…</> : 'Получить код'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="cpx-form">
          <p className="cpx-code-hint">Код отправлен на {phoneMasked || 'ваш номер'}. Введите 6 цифр из SMS.</p>
          <label className="cpx-field">
            <span className="cpx-field-label">Код из SMS</span>
            <input
              className="cpx-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
            />
          </label>
          {err && <p className="cpx-err">{err}</p>}
          <button type="submit" className="cpx-btn" disabled={busy}>
            {busy ? <><span className="cpx-spinner" /> Проверяем…</> : 'Войти'}
          </button>
          <div className="cpx-code-actions">
            <button type="button" className="cpx-link" onClick={() => { setStep('phone'); setCode(''); setErr(''); }}>
              Изменить номер
            </button>
            <button type="button" className="cpx-link" disabled={resendIn > 0 || busy} onClick={requestCode}>
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
    <>
      {profile.status === 'rejected' && profile.rejectReason && (
        <div className="cpx-card cpx-fin-banner">
          <span className="cpx-fin-banner-title">Заявка отклонена</span>
          <p className="cpx-sub" style={{ margin: 0 }}>{profile.rejectReason}</p>
          <p className="cpx-muted" style={{ marginTop: 8 }}>Загрузите документы ещё раз — заявка автоматически уйдёт на повторную проверку.</p>
        </div>
      )}

      <div className="cpx-card">
        <h2 className="cpx-h2">Данные для регистрации</h2>
        <p className="cpx-sub">Заполните ФИО и email — они понадобятся для выписок и связи по заявке.</p>
        <form onSubmit={saveInfo} className="cpx-fin-form-row">
          <label className="cpx-field">
            <span className="cpx-field-label">ФИО</span>
            <input value={fullName} onChange={(e) => { setFullName(e.target.value); setInfoSaved(false); }} placeholder="Иванов Иван Иванович" />
          </label>
          <label className="cpx-field">
            <span className="cpx-field-label">Email (для выписок)</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInfoSaved(false); }} placeholder="you@example.com" />
          </label>
          <button type="submit" className="cpx-btn cpx-btn--sm" disabled={savingInfo}>
            {savingInfo ? <span className="cpx-spinner" /> : infoSaved ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </form>
      </div>

      <div className="cpx-card">
        <h2 className="cpx-h2">Документы (KYC)</h2>
        <p className="cpx-sub">Загрузите фото или скан — модератор проверит их вручную.</p>
        <div className="cpx-fin-docs">
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
        {err && <p className="cpx-err">{err}</p>}
        <button type="button" className="cpx-btn" disabled={!hasRequired || submitting} onClick={submit}>
          {submitting ? <><span className="cpx-spinner" /> Отправляем…</> : 'Отправить на проверку'}
        </button>
        {!hasRequired && <p className="cpx-fin-hint">Загрузите паспорт (разворот) и селфи с паспортом.</p>}
      </div>
    </>
  );
}

function DocUploadRow({ docType, label, required, doc, uploading, onUpload }) {
  const inputRef = useRef(null);
  const status = doc?.status;
  return (
    <div className="cpx-fin-doc-row">
      <div className="cpx-fin-doc-main">
        <span className="cpx-fin-doc-label">{label}{required ? '' : ' (опционально)'}</span>
        {status && (
          <span className={`cpx-fin-badge cpx-fin-badge--${status}`}>
            {status === 'approved' ? 'Одобрено' : status === 'rejected' ? 'Отклонено' : 'На проверке'}
          </span>
        )}
        {status === 'rejected' && doc?.rejectReason && <span className="cpx-fin-doc-reason">{doc.rejectReason}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }}
      />
      <button type="button" className="cpx-fin-doc-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? <span className="cpx-spinner" /> : status ? 'Загрузить ещё раз' : 'Загрузить'}
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
    <div className="cpx-card cpx-center" style={{ color: 'var(--cpx-ink)', flexDirection: 'column', textAlign: 'center', padding: '36px 20px' }}>
      <span className="cpx-fin-pending-icon" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
      <h2 className="cpx-h2">Документы на проверке</h2>
      <p className="cpx-sub">Модератор Reaktivo проверяет ваши документы. Обычно это занимает до 1 рабочего дня.</p>
      <div className="cpx-fin-doc-status-list">
        {(profile.documents || []).map((d) => (
          <div key={d.id} className="cpx-fin-doc-status-row">
            <span>{DOC_LABELS[d.docType] || d.docType}</span>
            <span className={`cpx-fin-badge cpx-fin-badge--${d.status}`}>
              {d.status === 'approved' ? 'Одобрено' : d.status === 'rejected' ? 'Отклонено' : 'На проверке'}
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="cpx-btn cpx-btn--sm" disabled={refreshing} onClick={refresh}>
        {refreshing ? <span className="cpx-spinner" /> : 'Обновить статус'}
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

  if (loading) return <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загружаем портфель…</div>;
  if (err) return <div className="cpx-card"><p className="cpx-err">{err}</p><button type="button" className="cpx-btn cpx-btn--sm" onClick={load}>Повторить</button></div>;

  return (
    <>
      <div className="cpx-fin-kpis">
        <div className="cpx-fin-kpi cpx-fin-kpi--hero">
          <span className="cpx-fin-kpi-label">Золото на счёте</span>
          <span className="cpx-fin-kpi-value">{formatGrams(portfolio?.goldGrams)}</span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Стоимость портфеля</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.marketValueRub)}</span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Вложено</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.investedRub)}</span>
        </div>
        <div className={`cpx-fin-kpi ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-kpi--pos' : 'cpx-fin-kpi--neg'}`}>
          <span className="cpx-fin-kpi-label">Доход</span>
          <span className="cpx-fin-kpi-value">
            {formatMoney(portfolio?.pnlRub)}
            {portfolio?.pnlPercent != null && <span className="cpx-fin-kpi-pct"> ({portfolio.pnlPercent > 0 ? '+' : ''}{portfolio.pnlPercent}%)</span>}
          </span>
        </div>
        <div className="cpx-fin-kpi">
          <span className="cpx-fin-kpi-label">Рублёвый баланс</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.rubBalance)}</span>
        </div>
      </div>

      <div className="cpx-card cpx-fin-topup-hint">
        <span className="cpx-fin-topup-icon" aria-hidden>ℹ</span>
        <p>
          Пополнение — банковским переводом по реквизитам Reaktivo (уточните у менеджера).
          После поступления средств баланс пополнит модератор — обычно в течение рабочего дня.
        </p>
      </div>

      <div className="cpx-card">
        <h2 className="cpx-h2">Купить золото</h2>
        <form onSubmit={submitBuy} className="cpx-form">
          <div className="cpx-fin-mode-switch">
            <button type="button" className={`cpx-fin-mode-btn${mode === 'rub' ? ' cpx-fin-mode-btn--on' : ''}`} onClick={() => { setMode('rub'); setAmount(''); }}>В рублях</button>
            <button type="button" className={`cpx-fin-mode-btn${mode === 'grams' ? ' cpx-fin-mode-btn--on' : ''}`} onClick={() => { setMode('grams'); setAmount(''); }}>В граммах</button>
          </div>
          <label className="cpx-field">
            <span className="cpx-field-label">{mode === 'rub' ? 'Сумма, ₽' : 'Вес, г'}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === 'rub' ? 'например 10000' : 'например 1.5'}
            />
          </label>
          {estimate && (
            <p className="cpx-fin-estimate">
              {mode === 'rub' ? `≈ ${formatGrams(estimate.grams)}` : `≈ ${formatMoney(estimate.rub)}`}
              <span className="cpx-muted" style={{ display: 'inline', fontSize: '0.78rem' }}> (ориентир, точная сумма — при подтверждении)</span>
            </p>
          )}
          {buyErr && <p className="cpx-err">{buyErr}</p>}
          {buyOk && <p className="cpx-fin-ok">{buyOk}</p>}
          <button type="submit" className="cpx-btn" disabled={buying}>
            {buying ? <><span className="cpx-spinner" /> Покупаем…</> : 'Купить'}
          </button>
        </form>
      </div>

      <div className="cpx-card">
        <div className="cpx-fin-history-head">
          <h2 className="cpx-h2">История операций</h2>
          <button type="button" className="cpx-link" disabled={pdfBusy} onClick={downloadStatement}>
            {pdfBusy ? 'Готовим PDF…' : 'Скачать выписку (PDF)'}
          </button>
        </div>
        {ledger.length === 0 && <p className="cpx-muted">Операций пока нет.</p>}
        {ledger.map((e) => (
          <div key={e.id} className="cpx-fin-ledger-row">
            <div className="cpx-fin-ledger-main">
              <span className="cpx-fin-ledger-type">{ENTRY_LABELS[e.entryType] || e.entryType}</span>
              <span className="cpx-fin-ledger-date">{formatDateTime(e.createdAt)}</span>
            </div>
            <div className="cpx-fin-ledger-right">
              {!!e.rubDelta && <span className={e.rubDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.rubDelta > 0 ? '+' : ''}{formatMoney(e.rubDelta)}</span>}
              {!!e.goldGramsDelta && <span className={e.goldGramsDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.goldGramsDelta > 0 ? '+' : ''}{formatGrams(e.goldGramsDelta)}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
