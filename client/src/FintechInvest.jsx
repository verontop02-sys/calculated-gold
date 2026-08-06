import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fintechApi, getFintechToken, setFintechToken, onFintechSessionExpired } from './api.js';
import { openFintechStatementReport } from './fintechStatementReport.js';
import { WorldClocksCard } from './WorldClocks.jsx';
import { MissedBenefitCalc } from './MissedBenefitCalc.jsx';
import {
  AnimatePresence,
  FadeIn,
  Reveal,
  SPRING,
  motion,
  staggerChild,
  staggerParent,
} from './motionUi.jsx';

const SbpMark = ({ className = '' }) => (
  <span className={`cpx-sbp ${className}`.trim()} title="Система быстрых платежей" role="img" aria-label="СБП">
    <img src="/sbp.png" alt="" width="72" height="24" decoding="async" />
  </span>
);

function withSbp(text) {
  const parts = String(text || '').split('СБП');
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 ? <SbpMark className="cpx-sbp--inline" /> : null}
    </span>
  ));
}

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
export function FintechInvest({ clientToken = '', expectedPhone = '' }) {
  const [phase, setPhase] = useState('checking'); // checking | login | app
  const [profile, setProfile] = useState(null);
  const [loadErr, setLoadErr] = useState('');

  const loadProfile = useCallback(async () => {
    const p = await fintechApi.profile();
    setProfile(p);
    setPhase('app');
    setLoadErr('');
    return p;
  }, []);

  /** Тихий вход: есть клиентская сессия кабинета → выпускаем fintech-токен без SMS. */
  const ensureSession = useCallback(async () => {
    if (getFintechToken()) {
      try {
        const p = await loadProfile();
        // Сохранённый fintech-токен может принадлежать предыдущему пользователю
        // этого устройства — сверяем с телефоном текущей клиентской сессии.
        const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
        const mismatch = expectedPhone && p?.phoneNormalized && last10(p.phoneNormalized) !== last10(expectedPhone);
        if (!mismatch) return true;
        setProfile(null);
        setFintechToken('');
      } catch (e) {
        // Стейл-токен: ниже попробуем обмен из client-сессии.
        if (e?.status !== 401) {
          setLoadErr(e?.message || 'Не удалось загрузить кабинет');
          setPhase('app');
          return false;
        }
        setFintechToken('');
      }
    }
    if (clientToken) {
      try {
        await fintechApi.sessionFromClient(clientToken);
        await loadProfile();
        return true;
      } catch {
        /* покажем форму входа */
      }
    }
    setPhase('login');
    return false;
  }, [clientToken, expectedPhone, loadProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureSession();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [ensureSession]);

  // 401 от фонового запроса: сначала пробуем восстановить сессию из кабинета, не выкидывая на SMS.
  useEffect(() => onFintechSessionExpired(() => {
    if (clientToken) {
      fintechApi
        .sessionFromClient(clientToken)
        .then(() => loadProfile())
        .catch(() => {
          setProfile(null);
          setPhase('login');
        });
      return;
    }
    setProfile(null);
    setPhase('login');
  }), [clientToken, loadProfile]);

  // Пока документы на проверке — тихо обновляем статус, чтобы не заставлять жать «Обновить».
  useEffect(() => {
    if (profile?.status !== 'pending_review') return undefined;
    const id = setInterval(() => { void loadProfile().catch(() => {}); }, 20_000);
    return () => clearInterval(id);
  }, [profile?.status, loadProfile]);

  if (phase === 'login') {
    return <FintechLogin onDone={() => { void ensureSession(); }} />;
  }

  if (phase === 'checking') {
    return <div className="cpx-center"><span className="cpx-spinner" /> Загрузка…</div>;
  }

  if (loadErr) {
    return (
      <div className="cpx-card">
        <p className="cpx-err">{loadErr}</p>
        <button type="button" className="cpx-btn cpx-btn--sm" onClick={() => { void ensureSession(); }}>Повторить</button>
      </div>
    );
  }

  if (!profile) return null;

  if (profile.status === 'new' || profile.status === 'rejected') {
    return <FintechOnboarding profile={profile} onUpdated={() => { void loadProfile().catch(() => {}); }} />;
  }
  if (profile.status === 'pending_review') {
    return <FintechPendingReview profile={profile} onRefresh={() => loadProfile()} />;
  }
  if (profile.status === 'blocked') {
    return (
      <div className="cpx-card">
        <p className="cpx-err">Доступ к покупке золота заблокирован. Обратитесь к менеджеру Reaktivo.</p>
      </div>
    );
  }
  return <FintechDashboard profile={profile} />;
}

// ── Вход (телефон + SMS-код) — 1 в 1 с главным логином кабинета ────────────
function FintechLogin({ onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [smsWarn, setSmsWarn] = useState('');

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
      setSmsWarn(out.smsOk === false ? 'СМС не удалось отправить. Подождите немного и нажмите «Отправить код ещё раз» — либо свяжитесь с менеджером.' : '');
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
    <FadeIn>
    <div className="cpx-card cpx-login cpx-login--fin">
      <p className="cpx-login-eyebrow">REAKTIVO · PRO</p>
      <h1 className="cpx-title">Покупка золота</h1>
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
          {smsWarn && <p className="cpx-err" style={{ color: 'var(--warn-dot)' }}>{smsWarn}</p>}
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
            <button type="button" className="cpx-link" onClick={() => { setStep('phone'); setCode(''); setErr(''); setSmsWarn(''); }}>
              Изменить номер
            </button>
            <button type="button" className="cpx-link" disabled={resendIn > 0 || busy} onClick={requestCode}>
              {resendIn > 0 ? `Отправить ещё раз через ${resendIn}с` : 'Отправить код ещё раз'}
            </button>
          </div>
        </form>
      )}
    </div>
    </FadeIn>
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
  const lastSavedRef = useRef({ fullName: profile.fullName || '', email: profile.email || '' });

  /** Тихое автосохранение при уходе из поля — имя не потеряется, даже если
   *  клиент не нажал «Сохранить» (в админке пропадает «Без имени»). */
  async function autoSaveInfo() {
    const name = fullName.trim();
    const mail = email.trim();
    if (!name && !mail) return;
    if (lastSavedRef.current.fullName === name && lastSavedRef.current.email === mail) return;
    try {
      await fintechApi.updateProfile(name, mail);
      lastSavedRef.current = { fullName: name, email: mail };
      setInfoSaved(true);
    } catch {
      /* best-effort: явное сохранение остаётся кнопкой или при submit */
    }
  }

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
      lastSavedRef.current = { fullName: fullName.trim(), email: email.trim() };
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

  const missingSteps = [];
  if (!fullName.trim()) missingSteps.push('укажите ФИО');
  if (!docsByType.has('passport_main') || docsByType.get('passport_main').status === 'rejected') missingSteps.push('загрузите паспорт (разворот с фото)');
  if (!docsByType.has('selfie') || docsByType.get('selfie').status === 'rejected') missingSteps.push('загрузите селфи с паспортом');

  async function submit() {
    setSubmitting(true);
    setErr('');
    try {
      if (!fullName.trim()) {
        setErr('Укажите ФИО — оно нужно модератору для сверки с паспортом');
        return;
      }
      // ФИО/email могли быть введены, но не сохранены кнопкой — сохраняем сами,
      // чтобы заявка не улетела «Без имени».
      await fintechApi.updateProfile(fullName, email);
      lastSavedRef.current = { fullName: fullName.trim(), email: email.trim() };
      setInfoSaved(true);
      await fintechApi.submitForReview();
      await onUpdated?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось отправить на проверку');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cpx-fin-onboard">
      {profile.status === 'rejected' && profile.rejectReason && (
        <Reveal y={18}>
          <div className="cpx-card cpx-fin-banner cpx-fin-banner--reject">
            <span className="cpx-fin-banner-kicker">Статус заявки</span>
            <span className="cpx-fin-banner-title">Заявка отклонена</span>
            <p className="cpx-sub" style={{ margin: 0 }}>{profile.rejectReason}</p>
            <p className="cpx-muted" style={{ marginTop: 8 }}>Загрузите документы ещё раз — заявка автоматически уйдёт на повторную проверку.</p>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.06} y={20}>
      <div className="cpx-card cpx-fin-onboard-card">
        <h2 className="cpx-h2">Данные для регистрации</h2>
        <p className="cpx-sub">Заполните ФИО и email — они понадобятся для выписок и связи по заявке.</p>
        <form onSubmit={saveInfo} className="cpx-fin-form-row">
          <label className="cpx-field">
            <span className="cpx-field-label">ФИО</span>
            <input value={fullName} onChange={(e) => { setFullName(e.target.value); setInfoSaved(false); }} onBlur={autoSaveInfo} placeholder="Иванов Иван Иванович" />
          </label>
          <label className="cpx-field">
            <span className="cpx-field-label">Email (для выписок)</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInfoSaved(false); }} onBlur={autoSaveInfo} placeholder="you@example.com" />
          </label>
          <button type="submit" className="cpx-btn cpx-btn--sm" disabled={savingInfo}>
            {savingInfo ? <span className="cpx-spinner" /> : infoSaved ? 'Сохранено ✓' : 'Сохранить'}
          </button>
        </form>
      </div>
      </Reveal>

      <Reveal delay={0.12} y={20}>
      <div className="cpx-card cpx-fin-onboard-card">
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
        <button type="button" className="cpx-btn" disabled={!hasRequired || !fullName.trim() || submitting} onClick={submit}>
          {submitting ? <><span className="cpx-spinner" /> Отправляем…</> : 'Отправить на проверку'}
        </button>
        {missingSteps.length > 0 && (
          <p className="cpx-fin-hint">Чтобы отправить заявку: {missingSteps.join(', ')}.</p>
        )}
      </div>
      </Reveal>
    </div>
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
    <FadeIn>
    <div className="cpx-card cpx-fin-pending cpx-center" style={{ color: 'var(--cpx-ink)', flexDirection: 'column', textAlign: 'center', padding: '40px 22px' }}>
      <span className="cpx-fin-pending-icon" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </span>
      <span className="cpx-fin-banner-kicker">На проверке</span>
      <h2 className="cpx-h2">Документы у модератора</h2>
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
    </FadeIn>
  );
}
// ── График курса золота ─────────────────────────────────────────────────────
const CHART_RANGES = [
  { key: '1m', label: '1М', days: 31 },
  { key: '3m', label: '3М', days: 92 },
  { key: '6m', label: '6М', days: 183 },
  { key: '1y', label: '1Г', days: 366 },
  { key: '3y', label: '3Г', days: 1096 },
  { key: '5y', label: '5Л', days: 1830 },
];

// Источники графика: Мосбиржа (₽/г) и мировая биржа COMEX ($/oz) — правка Руслана.
const CHART_SOURCES = [
  { key: 'moex', label: 'Мосбиржа ₽', title: 'Мосбиржа GLDRUBF', per: '/ г' },
  { key: 'global', label: 'Мировая $', title: 'Мировая биржа · COMEX GC', per: '/ oz' },
];

function formatUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}

function formatChartDate(iso, rangeKey) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (rangeKey === '1y' || rangeKey === '6m' || rangeKey === '3y' || rangeKey === '5y') {
      return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function GoldChartCard({ currentRate, rateUpdatedAt }) {
  // История по источникам кэшируется отдельно: переключение MOEX ↔ мир не перезагружает данные.
  const [series, setSeries] = useState({ moex: null, global: null });
  const [range, setRange] = useState('3m');
  const [source, setSource] = useState('moex');

  useEffect(() => {
    if (series[source] !== null) return undefined;
    let alive = true;
    fintechApi
      .goldHistory(1830, source)
      .then((out) => { if (alive) setSeries((s) => ({ ...s, [source]: out.points || [] })); })
      .catch(() => { if (alive) setSeries((s) => ({ ...s, [source]: [] })); });
    return () => { alive = false; };
  }, [source, series]);

  const points = series[source];
  const isGlobal = source === 'global';
  const sourceConf = CHART_SOURCES.find((s) => s.key === source) || CHART_SOURCES[0];
  const fmtPrice = isGlobal ? formatUsd : formatMoney;

  const visible = useMemo(() => {
    if (!points?.length) return [];
    const days = CHART_RANGES.find((r) => r.key === range)?.days || 92;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoff);
  }, [points, range]);

  const delta = useMemo(() => {
    if (visible.length < 2) return null;
    const first = visible[0].price;
    const last = visible[visible.length - 1].price;
    if (!first) return null;
    return Math.round(((last - first) / first) * 1000) / 10;
  }, [visible]);

  const yDomain = useMemo(() => {
    if (!visible.length) return ['auto', 'auto'];
    const values = visible.map((p) => p.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, max * 0.004);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [visible]);

  // Для мировой биржи «текущий курс» — последняя дневная свеча COMEX.
  const headlinePrice = isGlobal
    ? (visible.length ? visible[visible.length - 1].price : null)
    : currentRate;

  return (
    <div className="cpx-card cpx-fin-chart-card">
      <div className="cpx-fin-chart-head">
        <div className="cpx-fin-chart-titles">
          <span className="cpx-fin-kpi-label">Курс золота · {sourceConf.title}</span>
          <div className="cpx-fin-chart-rate">
            <span className="cpx-fin-chart-price">{headlinePrice != null ? fmtPrice(headlinePrice) : '—'}<span className="cpx-fin-chart-per"> {sourceConf.per}</span></span>
            {delta != null && (
              <span className={`cpx-fin-chart-delta ${delta >= 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}`}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('ru-RU')}% за {CHART_RANGES.find((r) => r.key === range)?.label?.toLowerCase()}
              </span>
            )}
          </div>
          {!isGlobal && rateUpdatedAt && <span className="cpx-fin-chart-upd">обновлено {formatDateTime(rateUpdatedAt)}</span>}
          {isGlobal && visible.length > 0 && <span className="cpx-fin-chart-upd">дневные свечи · {new Date(`${visible[visible.length - 1].date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>}
        </div>
        <div className="cpx-fin-chart-controls">
          <div className="cpx-fin-range cpx-fin-source">
            {CHART_SOURCES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`cpx-fin-range-btn${source === s.key ? ' cpx-fin-range-btn--on' : ''}`}
                onClick={() => setSource(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="cpx-fin-range">
            {CHART_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`cpx-fin-range-btn${range === r.key ? ' cpx-fin-range-btn--on' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cpx-fin-chart-body">
        {points === null && <div className="cpx-muted" style={{ padding: '40px 0', justifyContent: 'center' }}><span className="cpx-spinner" /> Загружаем график…</div>}
        {points !== null && visible.length === 0 && <div className="cpx-muted" style={{ padding: '40px 0', justifyContent: 'center' }}>История курса временно недоступна</div>}
        {visible.length > 1 && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={visible} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="finGoldFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke-soft)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatChartDate(v, range)}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={42}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v) => `${Math.round(v).toLocaleString('ru-RU')}`}
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
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
                labelStyle={{ color: 'var(--text-muted)', marginBottom: 4 }}
                formatter={(v) => [isGlobal ? `${Number(v).toLocaleString('ru-RU')} $/oz` : `${Number(v).toLocaleString('ru-RU')} ₽/г`, 'Курс']}
                labelFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--accent)"
                strokeWidth={2.2}
                fill="url(#finGoldFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── AI-ассистент ────────────────────────────────────────────────────────────
function AssistantCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [err, setErr] = useState('');

  const ask = useCallback(async (q) => {
    setBusy(true);
    setErr('');
    try {
      const out = await fintechApi.assistant(q);
      setData(out);
      if (q) setQuestion('');
    } catch (e) {
      setErr(e?.message || 'Ассистент временно недоступен');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { ask(''); }, [ask]);

  function submitQuestion(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    ask(q);
  }

  const scenarios = data?.forecast?.scenarios || [];

  return (
    <div className="cpx-card cpx-fin-ai-card">
      <div className="cpx-fin-ai-head">
        <div className="cpx-fin-ai-title-wrap">
          <span className="cpx-fin-ai-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c1.5.5 3 2 3 4a4 4 0 0 1-1 2.65A4 4 0 0 1 16 19a4 4 0 0 1-8 0 4 4 0 0 1-2-6.35A4 4 0 0 1 5 10c0-2 1.5-3.5 3-4a4 4 0 0 1 4-4z" />
              <path d="M9 13a3 3 0 0 0 6 0" />
            </svg>
          </span>
          <h2 className="cpx-fin-ai-heading">AI-ассистент</h2>
          <span className={`cpx-fin-ai-badge${data?.source === 'grok' ? ' cpx-fin-ai-badge--grok' : ''}`}>
            {data?.source === 'grok' ? 'Grok' : 'Анализ'}
          </span>
        </div>
        <button type="button" className="cpx-link" disabled={busy} onClick={() => ask('')}>Обновить</button>
      </div>

      {busy && !data && <p className="cpx-muted"><span className="cpx-spinner" /> Анализируем портфель…</p>}
      {err && <p className="cpx-err">{err}</p>}

      {data?.answer && (
        <div className={`cpx-fin-ai-answer${busy ? ' cpx-fin-ai-answer--busy' : ''}`}>{data.answer}</div>
      )}

      {scenarios.length > 0 && (
        <div className="cpx-fin-ai-forecast">
          <div className="cpx-fin-ai-forecast-title">
            {data?.forecast?.accumulation
              ? `Прогноз при покупке ${data.forecast.monthlyGrams} г / мес · горизонт 5 лет`
              : 'Прогноз стоимости · горизонт 5 лет'}
          </div>
          <div className="cpx-fin-ai-scenarios">
            {scenarios.map((s) => {
              const y5 = s.values?.find((v) => v.years === 5) || s.values?.[s.values.length - 1];
              return (
                <div key={s.key} className={`cpx-fin-ai-scenario${s.key === 'hist' ? ' cpx-fin-ai-scenario--accent' : ''}`}>
                  <span className="cpx-fin-ai-scenario-label">{s.label}</span>
                  <span className="cpx-fin-ai-scenario-value">{formatMoney(y5?.valueRub)}</span>
                  <span className="cpx-fin-ai-scenario-meta">
                    {[1, 3].map((y) => {
                      const row = s.values?.find((v) => v.years === y);
                      return row ? `${y}г: ${formatMoney(row.valueRub)}` : null;
                    }).filter(Boolean).join(' · ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form onSubmit={submitQuestion} className="cpx-fin-ai-ask">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Спросите: что будет, если покупать по 5 г в месяц?"
          maxLength={500}
          disabled={busy}
        />
        <button type="submit" className="cpx-fin-ai-ask-btn" disabled={busy || !question.trim()}>
          {busy ? <span className="cpx-spinner" /> : 'Спросить'}
        </button>
      </form>
      <p className="cpx-fin-ai-disclaimer">Прогноз на исторических данных, не инвестиционная рекомендация.</p>
    </div>
  );
}

function LedgerList({ ledger, limit = 12 }) {
  // Клик по операции — попап с деталями: когда, сколько денег и по какому курсу был вход.
  const [selected, setSelected] = useState(null);

  if (!ledger.length) return <p className="cpx-muted" style={{ margin: 0 }}>Операций пока нет.</p>;
  return (
    <>
      <div className="cpx-fin-ledger-list">
        {ledger.slice(0, limit).map((e) => (
          <button type="button" key={e.id} className="cpx-fin-ledger-row cpx-fin-ledger-row--btn" onClick={() => setSelected(e)}>
            <div className="cpx-fin-ledger-main">
              <span className="cpx-fin-ledger-type">{ENTRY_LABELS[e.entryType] || e.entryType}</span>
              <span className="cpx-fin-ledger-date">{formatDateTime(e.createdAt)}</span>
            </div>
            <div className="cpx-fin-ledger-right">
              {!!e.rubDelta && <span className={e.rubDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.rubDelta > 0 ? '+' : ''}{formatMoney(e.rubDelta)}</span>}
              {!!e.goldGramsDelta && <span className={e.goldGramsDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>{e.goldGramsDelta > 0 ? '+' : ''}{formatGrams(e.goldGramsDelta)}</span>}
            </div>
            <span className="cpx-fin-ledger-chevron" aria-hidden>›</span>
          </button>
        ))}
      </div>
      {selected && <LedgerEntryModal entry={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/** Детали операции в попапе — правка Руслана: дата, деньги и курс входа по клику. */
function LedgerEntryModal({ entry, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = ENTRY_LABELS[entry.entryType] || entry.entryType;
  const isBuy = entry.entryType === 'buy_gold';
  const isSell = entry.entryType === 'sell_gold';
  const comment = entry.detail?.comment || '';
  const fullDate = (() => {
    try {
      return new Date(entry.createdAt).toLocaleString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return formatDateTime(entry.createdAt);
    }
  })();

  return (
    <div className="cpx-fin-op-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Операция: ${label}`}>
      <div className="cpx-fin-op-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cpx-fin-op-close" onClick={onClose} aria-label="Закрыть">✕</button>
        <span className={`cpx-fin-op-icon${isBuy ? ' cpx-fin-op-icon--buy' : isSell ? ' cpx-fin-op-icon--sell' : ''}`} aria-hidden>
          {isBuy ? '↓' : isSell ? '↑' : entry.entryType === 'deposit_rub' ? '+' : entry.entryType === 'withdraw_rub' ? '−' : '•'}
        </span>
        <h3 className="cpx-fin-op-title">{label}</h3>
        <p className="cpx-fin-op-date">{fullDate}</p>

        <div className="cpx-fin-op-rows">
          {!!entry.rubDelta && (
            <div className="cpx-fin-op-row">
              <span>{entry.rubDelta > 0 ? 'Зачислено на баланс' : 'Списано с баланса'}</span>
              <strong className={entry.rubDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>
                {entry.rubDelta > 0 ? '+' : ''}{formatMoney(entry.rubDelta)}
              </strong>
            </div>
          )}
          {!!entry.goldGramsDelta && (
            <div className="cpx-fin-op-row">
              <span>{entry.goldGramsDelta > 0 ? 'Золото зачислено' : 'Золото списано'}</span>
              <strong className={entry.goldGramsDelta > 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}>
                {entry.goldGramsDelta > 0 ? '+' : ''}{formatGrams(entry.goldGramsDelta)}
              </strong>
            </div>
          )}
          {entry.ratePerGram != null && (
            <div className="cpx-fin-op-row cpx-fin-op-row--rate">
              <span>Курс сделки</span>
              <strong>{formatMoney(entry.ratePerGram)} / г</strong>
            </div>
          )}
          {!!entry.feeRub && (
            <div className="cpx-fin-op-row">
              <span>Комиссия</span>
              <strong>{formatMoney(entry.feeRub)}</strong>
            </div>
          )}
          {comment && (
            <div className="cpx-fin-op-row">
              <span>Комментарий</span>
              <strong className="cpx-fin-op-comment">{comment}</strong>
            </div>
          )}
        </div>

        <button type="button" className="cpx-btn cpx-btn--sm cpx-fin-op-ok" onClick={onClose}>Понятно</button>
      </div>
    </div>
  );
}

// ── CTA под графиком: Купить / Пополнить ────────────────────────────────────
function TradeCtaBar({ active, onBuy, onTopup, rubBalance }) {
  return (
    <motion.div
      className="cpx-fin-cta-bar"
      role="group"
      aria-label="Купить золото или пополнить баланс"
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-5% 0px' }}
    >
      <motion.button
        type="button"
        variants={staggerChild}
        whileHover={{ y: -2 }}
        transition={SPRING}
        className={`cpx-fin-cta cpx-fin-cta--buy${active === 'buy' ? ' cpx-fin-cta--on' : ''}`}
        onClick={onBuy}
      >
        <strong>Купить золото</strong>
        <span>от 0,01 г · курс биржи</span>
      </motion.button>
      <motion.button
        type="button"
        variants={staggerChild}
        whileHover={{ y: -2 }}
        transition={SPRING}
        className={`cpx-fin-cta cpx-fin-cta--topup${active === 'topup' ? ' cpx-fin-cta--on' : ''}`}
        onClick={onTopup}
      >
        <strong>Пополнить</strong>
        <span>баланс {formatMoney(rubBalance)}</span>
      </motion.button>
    </motion.div>
  );
}

// ── Пополнение баланса (заявка до эквайринга) ───────────────────────────────
function TopUpPanel({ portfolio, onClose }) {
  const [amount, setAmount] = useState('50000');
  const [note, setNote] = useState('');
  const rubBal = Number(portfolio?.rubBalance) || 0;

  function submit(e) {
    e.preventDefault();
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setNote('Укажите сумму пополнения');
      return;
    }
    try {
      const key = 'cpx_fin_topup_drafts';
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      prev.unshift({ rub: v, at: new Date().toISOString(), status: 'awaiting_credit' });
      localStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
    } catch { /* ignore */ }
    setNote(`Заявка на ${formatMoney(v)} сохранена. Напишите в поддержку или на team@reaktivo.ru — модератор зачислит сумму на баланс. Онлайн-оплата через СБП подключится после эквайринга.`);
  }

  return (
    <Reveal y={20}>
    <div className="cpx-card cpx-fin-topup-panel" id="fin-topup">
      <div className="cpx-fin-soon-badge" aria-hidden>
        <span className="cpx-fin-soon-label">Скоро</span>
        <SbpMark className="cpx-sbp--compact" /> · карта
      </div>
      <div className="cpx-fin-topup-head">
        <div>
          <h2 className="cpx-fin-side-title">Пополнить баланс</h2>
          <p className="cpx-fin-side-sub">Сейчас на счёте {formatMoney(rubBal)}. Онлайн-оплата подключится после эквайринга — пока зачисление через модератора.</p>
        </div>
        {onClose && (
          <button type="button" className="cpx-link" onClick={onClose}>Скрыть</button>
        )}
      </div>
      <div className="cpx-fin-soon-card">
        <strong>Эквайринг и <SbpMark className="cpx-sbp--inline" /> в подключении</strong>
        <p>Оставьте заявку на сумму — напишите в поддержку или на team@reaktivo.ru, и модератор зачислит рубли на баланс. После этого можно сразу купить золото.</p>
      </div>
      <ol className="cpx-fin-topup-steps">
        <li>Укажите сумму и оставьте заявку</li>
        <li>Напишите в поддержку или на <a href="mailto:team@reaktivo.ru">team@reaktivo.ru</a></li>
        <li>Модератор зачислит рубли — можно покупать золото</li>
      </ol>
      <form onSubmit={submit} className="cpx-form cpx-fin-buy-form">
        <label className="cpx-field">
          <span className="cpx-field-label">Сумма пополнения, ₽</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
        </label>
        <div className="cpx-fin-topup-actions">
          <button type="submit" className="cpx-btn">Оставить заявку</button>
          <a className="cpx-btn cpx-btn--ghost" href="https://t.me/Reaktivoai" target="_blank" rel="noopener noreferrer">Telegram</a>
          <a className="cpx-btn cpx-btn--ghost" href="mailto:team@reaktivo.ru">Написать на почту</a>
        </div>
        <AnimatePresence>
          {note && (
            <motion.p
              className="cpx-fin-flash cpx-fin-flash--ok"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {note}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
      <p className="cpx-fin-topup-foot">{withSbp('Онлайн-оплата картой и СБП — после подключения эквайринга. Пока зачисление вручную через модератора.')}</p>
    </div>
    </Reveal>
  );
}

// ── Покупка: состав заказа ──────────────────────────────────────────────────
function BuyPanel({ portfolio, onDone, onTopup }) {
  const [mode, setMode] = useState('grams');
  const [amount, setAmount] = useState('1');
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState('');
  const [buyOk, setBuyOk] = useState('');

  const rate = Number(portfolio?.currentRatePerGram) || 0;
  const feePct = Number(portfolio?.buyFeePercent) || 0;
  const feeMult = 1 + feePct / 100;
  const minG = Number(portfolio?.minPurchaseGrams) || 0.01;
  const rubBal = Number(portfolio?.rubBalance) || 0;

  const quote = useMemo(() => {
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || !rate) return null;
    let grams;
    let rubGross;
    if (mode === 'rub') {
      rubGross = Math.round(v * 100) / 100;
      grams = rubGross / (rate * feeMult);
    } else {
      grams = v;
      rubGross = Math.round(grams * rate * feeMult * 100) / 100;
    }
    grams = Math.round(grams * 1e6) / 1e6;
    const rubNet = Math.round(grams * rate * 100) / 100;
    const feeRub = Math.round((rubGross - rubNet) * 100) / 100;
    return { grams, rubGross, rubNet, feeRub };
  }, [amount, mode, rate, feeMult]);

  async function submitBuy(e) {
    e.preventDefault();
    setBuyErr('');
    setBuyOk('');
    const v = parseFloat(String(amount).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setBuyErr('Укажите сумму или вес больше нуля');
      return;
    }
    if (quote && quote.grams < minG - 1e-9) {
      setBuyErr(`Минимальная покупка — ${minG.toLocaleString('ru-RU')} г`);
      return;
    }
    if (quote && quote.rubGross > rubBal) {
      setBuyErr('Недостаточно средств на рублёвом балансе. Пополните счёт.');
      return;
    }
    setBuying(true);
    try {
      const payload = mode === 'rub'
        ? { rubAmount: v, idempotencyKey: crypto.randomUUID() }
        : { grams: v, idempotencyKey: crypto.randomUUID() };
      const out = await fintechApi.buy(payload);
      setBuyOk(`Куплено ${formatGrams(out.gramsBought)} за ${formatMoney(out.rubSpent)}`);
      setAmount(mode === 'grams' ? '1' : '10000');
      await onDone?.();
    } catch (e2) {
      setBuyErr(e2?.message || 'Не удалось выполнить покупку');
    } finally {
      setBuying(false);
    }
  }

  function stepGrams(dir) {
    const step = 1;
    const cur = parseFloat(String(amount).replace(',', '.')) || 0;
    const next = Math.max(minG, Math.round((cur + dir * step) * 100) / 100);
    setMode('grams');
    setAmount(String(next));
  }

  return (
    <Reveal y={18}>
    <div className="cpx-fin-buy-panel cpx-fin-buy-panel--central">
      <div className="cpx-card cpx-fin-buy-card">
        <h2 className="cpx-fin-side-title">Купить золото</h2>
        <p className="cpx-fin-side-sub">
          От {minG.toLocaleString('ru-RU')} г · курс {rate ? formatMoney(rate) : '—'} / г
          {feePct ? ` · комиссия ${feePct}% уже в цене` : ''}
        </p>

        <form onSubmit={submitBuy} className="cpx-form cpx-fin-buy-form">
          {/* Единицы покупки: только знаки «г» и «₽» — правка маркетолога (убрали «В рублях / В граммах») */}
          <div className="cpx-fin-unit-switch" role="tablist" aria-label="Единицы покупки">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'grams'}
              className={`cpx-fin-unit-btn${mode === 'grams' ? ' cpx-fin-unit-btn--on' : ''}`}
              onClick={() => { setMode('grams'); setAmount('1'); }}
            >
              <span className="cpx-fin-unit-sign">г</span>
              <span className="cpx-fin-unit-cap">граммы</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'rub'}
              className={`cpx-fin-unit-btn${mode === 'rub' ? ' cpx-fin-unit-btn--on' : ''}`}
              onClick={() => { setMode('rub'); setAmount('10000'); }}
            >
              <span className="cpx-fin-unit-sign">₽</span>
              <span className="cpx-fin-unit-cap">рубли</span>
            </button>
          </div>

          {mode === 'grams' ? (
            <div className="cpx-fin-stepper">
              <button type="button" className="cpx-fin-stepper-btn" onClick={() => stepGrams(-1)} aria-label="Меньше">−</button>
              <div className="cpx-fin-stepper-value">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Вес в граммах"
                />
                <span>г</span>
              </div>
              <button type="button" className="cpx-fin-stepper-btn" onClick={() => stepGrams(1)} aria-label="Больше">+</button>
            </div>
          ) : (
            <label className="cpx-field">
              <span className="cpx-field-label">Сумма, ₽</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
            </label>
          )}
          <p className="cpx-fin-step-hint">{mode === 'grams' ? `шаг ±1 г · минимум ${minG.toLocaleString('ru-RU')} г · можно ввести вручную` : 'золото рассчитается по курсу автоматически'}</p>

          {quote && (
            <div className="cpx-fin-order">
              <div className="cpx-fin-order-title">Состав заказа</div>
              <div className="cpx-fin-order-row"><span>Номинал</span><strong>{formatGrams(quote.grams)}</strong></div>
              <div className="cpx-fin-order-row"><span>Цена без комиссии</span><strong>{formatMoney(quote.rubNet)}</strong></div>
              <div className="cpx-fin-order-row cpx-fin-order-row--accent">
                <span>Комиссия {feePct}%</span>
                <strong>{formatMoney(quote.feeRub)}</strong>
              </div>
              <div className="cpx-fin-order-total">
                <span>К оплате</span>
                <strong>{formatMoney(quote.rubGross)}</strong>
              </div>
              <div className="cpx-fin-order-bal">
                Доступно на балансе: {formatMoney(rubBal)}
                {quote.rubGross > rubBal && <span className="cpx-fin-neg"> · недостаточно</span>}
              </div>
            </div>
          )}

          {buyErr && <p className="cpx-err">{buyErr}</p>}
          <AnimatePresence>
            {buyOk && (
              <motion.p
                key={buyOk}
                className="cpx-fin-flash cpx-fin-flash--ok"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {buyOk}
              </motion.p>
            )}
          </AnimatePresence>
          {quote && quote.rubGross > rubBal ? (
            <button type="button" className="cpx-btn" onClick={onTopup}>
              Пополнить баланс и купить
            </button>
          ) : (
            <button type="submit" className="cpx-btn" disabled={buying || !quote}>
              {buying ? <><span className="cpx-spinner" /> Покупаем…</> : 'Подтвердить покупку'}
            </button>
          )}
        </form>
      </div>
    </div>
    </Reveal>
  );
}

const WITHDRAW_STATUS_LABEL = {
  pending: 'На модерации',
  approved: 'Принята в обработку',
  paid: 'Выплачено',
  rejected: 'Отклонена',
};

// ── Продажа + заявка на вывод ───────────────────────────────────────────────
function SellPanel({ portfolio, onDone }) {
  const [grams, setGrams] = useState('');
  const [selling, setSelling] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const rate = Number(portfolio?.currentRatePerGram) || 0;
  const feePct = Number(portfolio?.sellFeePercent) || 0;
  const feeMult = 1 - feePct / 100;
  const goldBal = Number(portfolio?.goldGrams) || 0;
  const rubBal = Number(portfolio?.rubBalance) || 0;
  const minG = Number(portfolio?.minSellGrams) || 1;

  const quote = useMemo(() => {
    const g = parseFloat(String(grams).replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0 || !rate) return null;
    const gross = Math.round(g * rate * 100) / 100;
    const net = Math.round(g * rate * feeMult * 100) / 100;
    const fee = Math.round((gross - net) * 100) / 100;
    return { grams: g, gross, net, fee };
  }, [grams, rate, feeMult]);

  async function submitSell(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const g = parseFloat(String(grams).replace(',', '.'));
    if (!Number.isFinite(g) || g <= 0) {
      setErr('Укажите вес больше нуля');
      return;
    }
    if (g < minG) {
      setErr(`Минимальная продажа — ${minG} г`);
      return;
    }
    if (g > goldBal + 1e-9) {
      setErr('Недостаточно золота на счёте');
      return;
    }
    setSelling(true);
    try {
      const out = await fintechApi.sell({ grams: g, idempotencyKey: crypto.randomUUID() });
      setOk(`Продано ${formatGrams(out.gramsSold)} · на баланс ${formatMoney(out.rubReceived)}`);
      setGrams('');
      await onDone?.();
    } catch (e2) {
      setErr(e2?.message || 'Не удалось продать');
    } finally {
      setSelling(false);
    }
  }

  return (
    <div className="cpx-fin-sell-grid">
      <Reveal y={18}>
      <div className="cpx-card">
        <h2 className="cpx-fin-side-title">Продать золото</h2>
        <p className="cpx-fin-side-sub">
          На счёте {formatGrams(goldBal)} · курс {rate ? formatMoney(rate) : '—'} / г
          {feePct ? ` · комиссия продажи ${feePct}%` : ''}
        </p>
        <form onSubmit={submitSell} className="cpx-form cpx-fin-buy-form">
          <label className="cpx-field">
            <span className="cpx-field-label">Вес, г</span>
            <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder={String(minG)} />
          </label>
          <button type="button" className="cpx-link" style={{ alignSelf: 'flex-start' }} onClick={() => setGrams(String(Math.floor(goldBal * 1e4) / 1e4))}>
            Продать всё
          </button>
          {quote && (
            <div className="cpx-fin-order">
              <div className="cpx-fin-order-title">Результат продажи</div>
              <div className="cpx-fin-order-row"><span>По курсу рынка</span><strong>{formatMoney(quote.gross)}</strong></div>
              <div className="cpx-fin-order-row"><span>Комиссия {feePct}%</span><strong>−{formatMoney(quote.fee)}</strong></div>
              <div className="cpx-fin-order-total"><span>На рублёвый баланс</span><strong>{formatMoney(quote.net)}</strong></div>
            </div>
          )}
          {err && <p className="cpx-err">{err}</p>}
          <AnimatePresence>
            {ok && (
              <motion.p
                key={ok}
                className="cpx-fin-flash cpx-fin-flash--ok"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {ok}
              </motion.p>
            )}
          </AnimatePresence>
          <button type="submit" className="cpx-btn" disabled={selling || !quote}>
            {selling ? <><span className="cpx-spinner" /> Продаём…</> : 'Продать на баланс'}
          </button>
        </form>
      </div>
      </Reveal>

      <Reveal delay={0.08} y={18}>
        <WithdrawPanel portfolio={portfolio} onDone={onDone} />
      </Reveal>
    </div>
  );
}

/**
 * Заявка на вывод. Пока нет A7/ПСБ, деньги переводятся вручную по реквизитам,
 * которые указывает клиент, но сумма резервируется на балансе сразу — заявка
 * реальная (не заглушка), с историей статусов и письмом клиенту по решению.
 */
function WithdrawPanel({ portfolio, onDone }) {
  const [rub, setRub] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [history, setHistory] = useState(null);

  const rubBal = Number(portfolio?.rubBalance) || 0;
  const feePct = Number(portfolio?.withdrawFeePercent) || 0;
  const minRub = Number(portfolio?.minWithdrawRub) || 0;

  const loadHistory = useCallback(async () => {
    try {
      const out = await fintechApi.withdrawals();
      setHistory(out.requests || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const quote = useMemo(() => {
    const v = parseFloat(String(rub).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return null;
    const fee = Math.round(v * (feePct / 100) * 100) / 100;
    const net = Math.round((v - fee) * 100) / 100;
    return { gross: v, fee, net };
  }, [rub, feePct]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const v = parseFloat(String(rub).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      setErr('Укажите сумму вывода');
      return;
    }
    if (minRub && v < minRub) {
      setErr(`Минимальная сумма вывода — ${formatMoney(minRub)}`);
      return;
    }
    if (v > rubBal) {
      setErr('Сумма больше рублёвого баланса');
      return;
    }
    if (!details.trim()) {
      setErr('Укажите реквизиты для перевода — номер карты или телефон СБП');
      return;
    }
    setSubmitting(true);
    try {
      const out = await fintechApi.requestWithdrawal({ rubAmount: v, payoutDetails: details.trim(), idempotencyKey: crypto.randomUUID() });
      setOk(`Заявка на ${formatMoney(out.request.rubAmount)} принята. Деньги зарезервированы, менеджер свяжется по реквизитам.`);
      setRub('');
      setDetails('');
      await Promise.all([loadHistory(), onDone?.()]);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось оформить заявку');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cpx-card cpx-fin-withdraw-card">
      <h2 className="cpx-fin-side-title">Вывод средств</h2>
      <p className="cpx-fin-side-sub">
        Доступно {formatMoney(rubBal)}. {withSbp('Перевод на карту или по СБП')} — вручную менеджером, пока нет прямой интеграции с банком.
        {feePct ? ` Комиссия за вывод ${feePct}%.` : ''}
      </p>
      <form onSubmit={submit} className="cpx-form cpx-fin-buy-form">
        <label className="cpx-field">
          <span className="cpx-field-label">Сумма вывода, ₽</span>
          <input inputMode="decimal" value={rub} onChange={(e) => setRub(e.target.value)} placeholder={minRub ? String(minRub) : '5000'} />
        </label>
        <label className="cpx-field">
          <span className="cpx-field-label">Реквизиты для перевода</span>
          <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Номер карты или телефон СБП" />
        </label>
        {quote && (
          <div className="cpx-fin-order">
            <div className="cpx-fin-order-title">Результат вывода</div>
            <div className="cpx-fin-order-row"><span>Сумма к списанию</span><strong>{formatMoney(quote.gross)}</strong></div>
            {feePct > 0 && <div className="cpx-fin-order-row"><span>Комиссия {feePct}%</span><strong>−{formatMoney(quote.fee)}</strong></div>}
            <div className="cpx-fin-order-total"><span>Вы получите</span><strong>{formatMoney(quote.net)}</strong></div>
          </div>
        )}
        {err && <p className="cpx-err">{err}</p>}
        <AnimatePresence>
          {ok && (
            <motion.p
              key={ok}
              className="cpx-fin-flash cpx-fin-flash--ok"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {ok}
            </motion.p>
          )}
        </AnimatePresence>
        <button type="submit" className="cpx-btn cpx-btn--sm" disabled={submitting}>
          {submitting ? <><span className="cpx-spinner" /> Отправляем…</> : 'Оставить заявку'}
        </button>
      </form>

      {history !== null && history.length > 0 && (
        <div className="cpx-fin-doc-status-list" style={{ marginTop: 16 }}>
          {history.map((h) => (
            <div key={h.id} className="cpx-fin-doc-status-row">
              <span>{formatMoney(h.rubAmount)} · {formatDateTime(h.createdAt)}</span>
              <span className={`cpx-fin-badge cpx-fin-badge--${h.status === 'paid' ? 'approved' : h.status === 'rejected' ? 'rejected' : 'pending'}`}>
                {WITHDRAW_STATUS_LABEL[h.status] || h.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DASH_TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'buy', label: 'Купить' },
  { key: 'sell', label: 'Продать' },
  { key: 'auto', label: 'Автоматизация' },
  { key: 'benefit', label: 'Выгода' },
];

// ── Дашборд после одобрения ─────────────────────────────────────────────────
function FintechDashboard({ profile }) {
  const [portfolio, setPortfolio] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState('buy');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showTopup, setShowTopup] = useState(false);

  const openBuy = useCallback(() => {
    setShowTopup(false);
    setView('buy');
  }, []);

  const openTopup = useCallback(() => {
    setView('buy');
    setShowTopup(true);
  }, []);

  useEffect(() => {
    if (!showTopup || view !== 'buy') return undefined;
    const t = window.setTimeout(() => {
      document.getElementById('fin-topup')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [showTopup, view]);

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

  const firstName = String(profile?.fullName || '').trim().split(/\s+/)[1]
    || String(profile?.fullName || '').trim().split(/\s+/)[0]
    || '';

  return (
    <div className="cpx-finx">
      <Reveal y={16}>
      <div className={`cpx-fin-hero ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-hero--pos' : 'cpx-fin-hero--neg'}`}>
        <div className="cpx-fin-hero-main">
          <p className="cpx-fin-greeting-sub">Reaktivo · золотой счёт</p>
          <h2 className="cpx-fin-hero-title">{firstName ? `${firstName}, ваш портфель` : 'Ваш портфель'}</h2>
          <div className="cpx-fin-hero-value">
            <span className="cpx-fin-hero-value-num">{formatMoney(portfolio?.marketValueRub)}</span>
            <span className={`cpx-fin-hero-pnl ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-pos' : 'cpx-fin-neg'}`}>
              {portfolio?.pnlRub != null ? `${portfolio.pnlRub >= 0 ? '+' : ''}${formatMoney(portfolio.pnlRub)}` : '—'}
              {portfolio?.pnlPercent != null && ` (${portfolio.pnlPercent > 0 ? '+' : ''}${portfolio.pnlPercent}%)`}
            </span>
          </div>
          <p className="cpx-fin-hero-meta">
            {formatGrams(portfolio?.goldGrams)} · вложено {formatMoney(portfolio?.investedRub)} · кэш {formatMoney(portfolio?.rubBalance)}
          </p>
        </div>
        <div className="cpx-fin-hero-actions">
          <button type="button" className="cpx-btn cpx-btn--sm" onClick={openBuy}>Купить</button>
          <button type="button" className="cpx-fin-pdf-btn" onClick={openTopup}>Пополнить</button>
          <button type="button" className="cpx-fin-pdf-btn" onClick={() => setView('sell')}>Продать</button>
          <button type="button" className="cpx-fin-pdf-btn" disabled={pdfBusy} onClick={downloadStatement}>
            {pdfBusy ? <><span className="cpx-spinner" /> …</> : 'Выписка PDF'}
          </button>
        </div>
      </div>
      </Reveal>

      <motion.div
        className="cpx-fin-kpis"
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-5% 0px' }}
      >
        <motion.div className="cpx-fin-kpi cpx-fin-kpi--hero" variants={staggerChild}>
          <span className="cpx-fin-kpi-label">Золото на счёте</span>
          <span className="cpx-fin-kpi-value">{formatGrams(portfolio?.goldGrams)}</span>
        </motion.div>
        <motion.div className="cpx-fin-kpi" variants={staggerChild}>
          <span className="cpx-fin-kpi-label">Стоимость</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.marketValueRub)}</span>
        </motion.div>
        <motion.div className="cpx-fin-kpi" variants={staggerChild}>
          <span className="cpx-fin-kpi-label">Вложено</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.investedRub)}</span>
        </motion.div>
        <motion.div className={`cpx-fin-kpi ${(portfolio?.pnlRub ?? 0) >= 0 ? 'cpx-fin-kpi--pos' : 'cpx-fin-kpi--neg'}`} variants={staggerChild}>
          <span className="cpx-fin-kpi-label">Доход</span>
          <span className="cpx-fin-kpi-value">
            {formatMoney(portfolio?.pnlRub)}
            {portfolio?.pnlPercent != null && <span className="cpx-fin-kpi-pct"> ({portfolio.pnlPercent > 0 ? '+' : ''}{portfolio.pnlPercent}%)</span>}
          </span>
        </motion.div>
        <motion.div className="cpx-fin-kpi" variants={staggerChild}>
          <span className="cpx-fin-kpi-label">Рублёвый баланс</span>
          <span className="cpx-fin-kpi-value">{formatMoney(portfolio?.rubBalance)}</span>
        </motion.div>
      </motion.div>

      <nav className="cpx-fin-tabs" aria-label="Разделы золотого счёта">
        {DASH_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cpx-fin-tab${view === t.key ? ' cpx-fin-tab--on' : ''}`}
            onClick={() => {
              if (t.key === 'buy') openBuy();
              else {
                setShowTopup(false);
                setView(t.key);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <div className="cpx-fin-overview">
          <Reveal y={12} className="cpx-fin-overview-clocks">
            <WorldClocksCard delay="0ms" className="cpx-fin-clocks" />
          </Reveal>
          <div className="cpx-fin-overview-main">
            <Reveal delay={0.05} y={16}>
              <GoldChartCard currentRate={portfolio?.currentRatePerGram} rateUpdatedAt={portfolio?.rateUpdatedAt} />
            </Reveal>
            <TradeCtaBar
              active={null}
              rubBalance={portfolio?.rubBalance}
              onBuy={openBuy}
              onTopup={openTopup}
            />
            <Reveal delay={0.1} y={16}><AssistantCard /></Reveal>
          </div>
          <aside className="cpx-fin-overview-side">
            <Reveal delay={0.08} y={16}>
              <MissedBenefitCalc compact onOpenFull={() => setView('benefit')} />
            </Reveal>
            <Reveal delay={0.12} y={16}>
              <div className="cpx-card cpx-fin-history-card">
                <h2 className="cpx-fin-side-title">Последние операции</h2>
                <LedgerList ledger={ledger} limit={8} />
              </div>
            </Reveal>
          </aside>
        </div>
      )}

      {view === 'buy' && (
        <div className="cpx-fin-trade cpx-fin-trade--buy">
          <div className="cpx-fin-trade-main">
            <Reveal y={14}>
              <GoldChartCard currentRate={portfolio?.currentRatePerGram} rateUpdatedAt={portfolio?.rateUpdatedAt} />
            </Reveal>
            <TradeCtaBar
              active={showTopup ? 'topup' : 'buy'}
              rubBalance={portfolio?.rubBalance}
              onBuy={openBuy}
              onTopup={openTopup}
            />
            {showTopup && <TopUpPanel portfolio={portfolio} onClose={() => setShowTopup(false)} />}
          </div>
          <div className="cpx-fin-trade-side">
            <BuyPanel portfolio={portfolio} onDone={load} onTopup={openTopup} />
            <Reveal delay={0.1} y={14}>
              <div className="cpx-card cpx-fin-history-card">
                <h2 className="cpx-fin-side-title">Последние операции</h2>
                <LedgerList ledger={ledger} limit={6} />
              </div>
            </Reveal>
          </div>
        </div>
      )}

      {view === 'sell' && <SellPanel portfolio={portfolio} onDone={load} />}

      {view === 'auto' && <AutomationPanel portfolio={portfolio} onDone={load} />}

      {view === 'benefit' && <MissedBenefitCalc />}
    </div>
  );
}

const ALERT_STATUS_LABEL = {
  active: 'Активно',
  triggered: 'Сработало',
  failed: 'Не удалось',
  cancelled: 'Отменено',
};

const RECURRING_STATUS_LABEL = {
  active: 'Активна',
  paused: 'На паузе',
  cancelled: 'Отменена',
};

/**
 * Автоматизация: ценовые коридоры (п.6 ТЗ) и регулярные инвестиции (п.7).
 * Автопокупка пока списывает деньги с уже пополненного рублёвого баланса —
 * прямого списания с карты не будет, пока не подключён эквайринг с сохранением токена.
 */
function AutomationPanel({ portfolio, onDone }) {
  return (
    <div className="cpx-fin-sell-grid">
      <Reveal y={18}><PriceAlertsPanel portfolio={portfolio} onDone={onDone} /></Reveal>
      <Reveal delay={0.08} y={18}><RecurringPanel portfolio={portfolio} onDone={onDone} /></Reveal>
    </div>
  );
}

const SELL_TARGET_PRESETS = [5, 10, 20, 30];
const BUY_TARGET_PRESETS = [-5, -10, -15];

function PriceAlertsPanel({ portfolio, onDone }) {
  const [direction, setDirection] = useState('sell');
  // sellMode: 'total' — «хочу продать весь портфель за ₽X» (понятно без курса);
  // 'rate' — прямой ввод курса ₽/г, для тех, кто уже мыслит в этих цифрах.
  const [sellMode, setSellMode] = useState('total');
  const [targetRate, setTargetRate] = useState('');
  const [targetTotal, setTargetTotal] = useState('');
  const [amountMode, setAmountMode] = useState('grams');
  const [amountValue, setAmountValue] = useState('1');
  const [alerts, setAlerts] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const rate = Number(portfolio?.currentRatePerGram) || 0;
  const goldGrams = Number(portfolio?.goldGrams) || 0;
  const investedRub = Number(portfolio?.investedRub) || 0;
  const avgCostPerGram = goldGrams > 0 ? investedRub / goldGrams : 0;

  const load = useCallback(async () => {
    try {
      const out = await fintechApi.priceAlerts();
      setAlerts(out.alerts || []);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Продажа «за сумму»: считаем нужный курс сами и продаём весь текущий остаток золота.
  const effectiveRate = useMemo(() => {
    if (direction === 'sell' && sellMode === 'total') {
      const total = parseFloat(String(targetTotal).replace(',', '.'));
      if (!Number.isFinite(total) || total <= 0 || goldGrams <= 0) return null;
      return total / goldGrams;
    }
    return parseFloat(String(targetRate).replace(',', '.'));
  }, [direction, sellMode, targetTotal, targetRate, goldGrams]);

  const effectiveAmountMode = direction === 'sell' && sellMode === 'total' ? 'grams' : amountMode;
  const effectiveAmountValue = direction === 'sell' && sellMode === 'total' ? goldGrams : parseFloat(String(amountValue).replace(',', '.'));

  const profitPct = effectiveRate && avgCostPerGram > 0 ? Math.round(((effectiveRate - avgCostPerGram) / avgCostPerGram) * 1000) / 10 : null;
  const dropPct = effectiveRate && rate > 0 ? Math.round(((effectiveRate - rate) / rate) * 1000) / 10 : null;

  function applyPreset(pct) {
    const base = direction === 'sell' && avgCostPerGram > 0 ? avgCostPerGram : rate;
    if (!base) return;
    const target = Math.round(base * (1 + pct / 100));
    if (direction === 'sell' && sellMode === 'total' && goldGrams > 0) {
      setTargetTotal(String(Math.round(target * goldGrams)));
    } else {
      setTargetRate(String(target));
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    if (!Number.isFinite(effectiveRate) || effectiveRate <= 0) {
      setErr(direction === 'sell' && sellMode === 'total' ? 'Укажите желаемую сумму за портфель' : 'Укажите целевой курс');
      return;
    }
    if (!Number.isFinite(effectiveAmountValue) || effectiveAmountValue <= 0) {
      setErr('Укажите сумму или вес');
      return;
    }
    setSubmitting(true);
    try {
      await fintechApi.createPriceAlert({
        direction,
        targetRate: effectiveRate,
        amountMode: effectiveAmountMode,
        amountValue: effectiveAmountValue,
      });
      setOk('Условие создано. Как только курс дойдёт до цели — сделка выполнится автоматически.');
      setTargetRate('');
      setTargetTotal('');
      await Promise.all([load(), onDone?.()]);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось создать условие');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id) {
    try {
      await fintechApi.cancelPriceAlert(id);
      await load();
    } catch (e) {
      setErr(e?.message || 'Не удалось отменить условие');
    }
  }

  const active = (alerts || []).filter((a) => a.status === 'active');
  const history = (alerts || []).filter((a) => a.status !== 'active');
  const presets = direction === 'sell' ? SELL_TARGET_PRESETS : BUY_TARGET_PRESETS;

  return (
    <div className="cpx-card">
      <h2 className="cpx-fin-side-title">Ценовые условия</h2>
      <p className="cpx-fin-side-sub">
        Задайте условие — купим или продадим автоматически, как только биржа его достигнет.
        {rate ? ` Сейчас курс ${formatMoney(rate)} / г.` : ''}
      </p>

      <form onSubmit={submit} className="cpx-form cpx-fin-buy-form">
        <div className="cpx-fin-unit-switch" role="tablist" aria-label="Направление условия">
          <button type="button" role="tab" aria-selected={direction === 'sell'} className={`cpx-fin-unit-btn${direction === 'sell' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setDirection('sell')}>
            <span className="cpx-fin-unit-cap">Продать при росте</span>
          </button>
          <button type="button" role="tab" aria-selected={direction === 'buy'} className={`cpx-fin-unit-btn${direction === 'buy' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setDirection('buy')}>
            <span className="cpx-fin-unit-cap">Купить при падении</span>
          </button>
        </div>

        {direction === 'sell' && goldGrams > 0 && (
          <div className="cpx-fin-unit-switch">
            <button type="button" className={`cpx-fin-unit-btn${sellMode === 'total' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setSellMode('total')}>
              <span className="cpx-fin-unit-cap">По сумме продажи</span>
            </button>
            <button type="button" className={`cpx-fin-unit-btn${sellMode === 'rate' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setSellMode('rate')}>
              <span className="cpx-fin-unit-cap">По курсу ₽/г</span>
            </button>
          </div>
        )}

        {direction === 'sell' && sellMode === 'total' && goldGrams > 0 ? (
          <label className="cpx-field">
            <span className="cpx-field-label">Продать все {formatGrams(goldGrams)}, когда за них дадут, ₽</span>
            <input inputMode="decimal" value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} placeholder={String(Math.round(goldGrams * (avgCostPerGram || rate) * 1.1))} />
          </label>
        ) : (
          <label className="cpx-field">
            <span className="cpx-field-label">Целевой курс, ₽/г</span>
            <input inputMode="decimal" value={targetRate} onChange={(e) => setTargetRate(e.target.value)} placeholder={rate ? String(Math.round(rate)) : '8000'} />
          </label>
        )}

        {(rate > 0 || avgCostPerGram > 0) && (
          <div className="cpx-fin-preset-row">
            {presets.map((pct) => (
              <button key={pct} type="button" className="cpx-fin-preset-btn" onClick={() => applyPreset(pct)}>
                {pct > 0 ? `+${pct}%` : `${pct}%`}
              </button>
            ))}
          </div>
        )}

        {effectiveRate > 0 && (
          <p className="cpx-fin-step-hint">
            Это курс ≈ {formatMoney(effectiveRate)} / г
            {direction === 'sell' && profitPct != null && ` · доходность ${profitPct > 0 ? '+' : ''}${profitPct}% от вложенного`}
            {direction === 'buy' && dropPct != null && ` · это ${dropPct > 0 ? '+' : ''}${dropPct}% к текущему курсу`}
          </p>
        )}

        {!(direction === 'sell' && sellMode === 'total') && (
          <div className="cpx-fin-form-row">
            <label className="cpx-field">
              <span className="cpx-field-label">{amountMode === 'grams' ? 'Вес, г' : 'Сумма, ₽'}</span>
              <input inputMode="decimal" value={amountValue} onChange={(e) => setAmountValue(e.target.value)} />
            </label>
            <div className="cpx-fin-unit-switch">
              <button type="button" className={`cpx-fin-unit-btn${amountMode === 'grams' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setAmountMode('grams')}>г</button>
              <button type="button" className={`cpx-fin-unit-btn${amountMode === 'rub' ? ' cpx-fin-unit-btn--on' : ''}`} onClick={() => setAmountMode('rub')}>₽</button>
            </div>
          </div>
        )}

        {err && <p className="cpx-err">{err}</p>}
        <AnimatePresence>
          {ok && (
            <motion.p key={ok} className="cpx-fin-flash cpx-fin-flash--ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {ok}
            </motion.p>
          )}
        </AnimatePresence>
        <button type="submit" className="cpx-btn cpx-btn--sm" disabled={submitting}>
          {submitting ? <><span className="cpx-spinner" /> Создаём…</> : 'Создать условие'}
        </button>
      </form>

      {active.length > 0 && (
        <div className="cpx-fin-doc-status-list" style={{ marginTop: 16 }}>
          {active.map((a) => (
            <div key={a.id} className="cpx-fin-doc-status-row">
              <span>
                {a.direction === 'buy' ? 'Купить' : 'Продать'} {a.amountMode === 'grams' ? formatGrams(a.amountValue) : formatMoney(a.amountValue)} при {formatMoney(a.targetRatePerGram)}/г
              </span>
              <button type="button" className="cpx-link" onClick={() => cancel(a.id)}>Отменить</button>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="cpx-fin-doc-status-list" style={{ marginTop: 10 }}>
          {history.slice(0, 6).map((a) => (
            <div key={a.id} className="cpx-fin-doc-status-row">
              <span>{a.direction === 'buy' ? 'Купить' : 'Продать'} при {formatMoney(a.targetRatePerGram)}/г</span>
              <span className={`cpx-fin-badge cpx-fin-badge--${a.status === 'triggered' ? 'approved' : a.status === 'failed' ? 'rejected' : 'pending'}`}>
                {ALERT_STATUS_LABEL[a.status] || a.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringPanel({ portfolio, onDone }) {
  const [sub, setSub] = useState(null);
  const [runs, setRuns] = useState([]);
  const [rub, setRub] = useState('5000');
  const [day, setDay] = useState('1');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await fintechApi.recurring();
      setSub(out.subscription);
      setRuns(out.runs || []);
      if (out.subscription) {
        setRub(String(out.subscription.rubAmount));
        setDay(String(out.subscription.dayOfMonth));
      }
    } catch {
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const rubVal = parseFloat(String(rub).replace(',', '.'));
    const dayVal = parseInt(day, 10);
    if (!Number.isFinite(rubVal) || rubVal <= 0) {
      setErr('Укажите сумму больше нуля');
      return;
    }
    setBusy(true);
    try {
      await fintechApi.setRecurring({ rubAmount: rubVal, dayOfMonth: dayVal });
      setOk('Подписка настроена — каждый месяц будем покупать золото с баланса автоматически.');
      await Promise.all([load(), onDone?.()]);
    } catch (e2) {
      setErr(e2?.message || 'Не удалось настроить подписку');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(status) {
    setBusy(true);
    try {
      await fintechApi.setRecurringStatus(status);
      await load();
    } catch (e) {
      setErr(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="cpx-card cpx-muted"><span className="cpx-spinner" /> Загрузка…</div>;

  return (
    <div className="cpx-card">
      <h2 className="cpx-fin-side-title">Регулярные инвестиции</h2>
      <p className="cpx-fin-side-sub">
        Каждый месяц автоматически купим золото на баланс — деньги списываются с уже пополненного рублёвого баланса кабинета
        (прямое списание с карты подключим вместе с эквайрингом).
      </p>

      {sub && (
        <div className="cpx-fin-status-row" style={{ marginBottom: 12 }}>
          <span className={`cpx-fin-badge cpx-fin-badge--${sub.status === 'active' ? 'approved' : 'pending'}`}>
            {RECURRING_STATUS_LABEL[sub.status] || sub.status}
          </span>
          <span className="cpx-muted" style={{ fontSize: '0.8rem' }}>
            {formatMoney(sub.rubAmount)} · {sub.dayOfMonth} числа{sub.nextRunAt ? ` · следующее списание ${formatDateTime(sub.nextRunAt)}` : ''}
          </span>
        </div>
      )}

      <form onSubmit={submit} className="cpx-form cpx-fin-buy-form">
        <div className="cpx-fin-form-row">
          <label className="cpx-field">
            <span className="cpx-field-label">Сумма в месяц, ₽</span>
            <input inputMode="decimal" value={rub} onChange={(e) => setRub(e.target.value)} placeholder="5000" />
          </label>
          <label className="cpx-field">
            <span className="cpx-field-label">Число месяца</span>
            <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="1" />
          </label>
        </div>
        {err && <p className="cpx-err">{err}</p>}
        <AnimatePresence>
          {ok && (
            <motion.p key={ok} className="cpx-fin-flash cpx-fin-flash--ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {ok}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="cpx-fin-topup-actions">
          <button type="submit" className="cpx-btn cpx-btn--sm" disabled={busy}>
            {sub ? 'Обновить подписку' : 'Включить автоинвестиции'}
          </button>
          {sub?.status === 'active' && (
            <button type="button" className="cpx-btn cpx-btn--ghost" disabled={busy} onClick={() => toggle('paused')}>Приостановить</button>
          )}
          {sub?.status === 'paused' && (
            <button type="button" className="cpx-btn cpx-btn--ghost" disabled={busy} onClick={() => toggle('active')}>Возобновить</button>
          )}
          {sub && sub.status !== 'cancelled' && (
            <button type="button" className="cpx-btn cpx-btn--ghost" disabled={busy} onClick={() => toggle('cancelled')}>Отменить</button>
          )}
        </div>
      </form>

      {runs.length > 0 && (
        <div className="cpx-fin-doc-status-list" style={{ marginTop: 16 }}>
          {runs.map((r) => (
            <div key={r.id} className="cpx-fin-doc-status-row">
              <span>{r.runDate} · {formatMoney(r.rubAmount)}{r.gramsBought ? ` → ${formatGrams(r.gramsBought)}` : ''}</span>
              <span className={`cpx-fin-badge cpx-fin-badge--${r.status === 'success' ? 'approved' : 'rejected'}`}>
                {r.status === 'success' ? 'Успешно' : 'Ошибка'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
