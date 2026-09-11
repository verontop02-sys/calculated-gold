import crypto from 'crypto';

/**
 * Проверка действительности паспорта РФ по данным МВД через СМЭВ.
 * Прямого публичного сервиса МВД с 2023 года нет — используем коммерческого
 * посредника NewDB (метод passport_mvd).
 *
 * МВД в часы пик отвечает от ~30 секунд до нескольких минут. Синхронный /run
 * плюс короткий abort на нашей стороне рвали проверку раньше ответа. Асинхронный
 * POST + опрос /v2/data по одному requestId: задача на стороне NewDB дорабатывает,
 * повторный клик не создаёт новую платную проверку.
 *
 * Нужна переменная окружения NEWDB_API_KEY (токен из личного кабинета newdb.net).
 * Тариф на момент написания — 2 ₽ за проверку.
 */

const BASE_URL = 'https://api.newdb.net/v2';
/** Один HTTP-вызов к NewDB. Должен укладываться в лимит Render free (~30 с). */
const HTTP_TIMEOUT_MS = 12_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PENDING_STATES = new Set([
  'queued',
  'in_progress',
  'restart',
  'processing',
  'pending',
  'timeout',
  'running',
]);

const TRANSIENT_RE =
  /внутренн|unavailable|недоступ|ошибка сервиса|service error|try again|повторит|timeout|таймаут|временно/i;

export function passportValidityCheckConfigured() {
  return Boolean(process.env.NEWDB_API_KEY);
}

export function isPassportCheckRequestId(raw) {
  return UUID_RE.test(String(raw || '').trim());
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

/** NewDB ждёт YYYY-MM-DD. Форма и OCR отдают ДД.ММ.ГГГГ — иначе СМЭВ отвечает ошибкой. */
export function toIsoDob(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[.\s/-](\d{1,2})[.\s/-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }
  return '';
}

export function formatBirthDateDotted(raw) {
  const iso = toIsoDob(raw);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Полная дата ДД.ММ.ГГГГ — без неё договор не формируем. */
export function isCompleteBirthDate(raw) {
  const dotted = formatBirthDateDotted(raw);
  const m = dotted.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return false;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const yearNow = new Date().getFullYear();
  if (yyyy < 1900 || yyyy > yearNow) return false;
  return true;
}

function isTransientRaw(raw) {
  return TRANSIENT_RE.test(String(raw || ''));
}

function apiHeaders() {
  return {
    'X-API-KEY': process.env.NEWDB_API_KEY,
    Accept: 'application/json',
  };
}

async function newdbFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { ...apiHeaders(), ...(opts.headers || {}) },
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = fail(504, 'Сервис проверки паспортов не ответил. Повторите через минуту');
      err.transient = true;
      throw err;
    }
    const err = fail(502, 'Не удалось связаться с сервисом проверки паспортов. Попробуйте ещё раз');
    err.transient = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw fail(502, `Сервис проверки паспортов вернул не-JSON (${res.status})`);
  }
  if (!res.ok) {
    const msg = String(json?.error || json?.message || '');
    if (res.status === 401 || res.status === 403) {
      throw fail(502, 'Ключ NewDB отклонён. Проверьте NEWDB_API_KEY на сервере');
    }
    if (res.status === 402 || /balance|баланс|insufficient|недостаточн/i.test(msg)) {
      throw fail(502, 'Закончился баланс NewDB — пополните кабинет, иначе проверка МВД не работает');
    }
    if (res.status === 404) {
      return { json: { state: 'queued' }, http: 404 };
    }
    if (res.status >= 500 || isTransientRaw(msg)) {
      const err = fail(502, msg || `Сервис МВД временно недоступен (${res.status})`);
      err.transient = true;
      throw err;
    }
    throw fail(502, msg || `Ошибка проверки паспорта (${res.status})`);
  }
  return { json, http: res.status };
}

/**
 * Баланс аккаунта NewDB (₽). Проверки платные (≈2₽/шт) — виджет для админа,
 * чтобы пополнить заранее и не остаться без проверки посреди ключевой сделки.
 */
export async function getNewDbBalance() {
  if (!passportValidityCheckConfigured()) {
    throw fail(503, 'NEWDB_API_KEY не настроен на сервере');
  }
  const res = await fetch(`${BASE_URL}/balance`, { headers: apiHeaders() });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw fail(502, `NewDB вернул не-JSON при запросе баланса (${res.status})`);
  }
  if (!res.ok) {
    throw fail(502, json?.error || json?.message || `Ошибка запроса баланса (${res.status})`);
  }
  return { balance: Number(json?.balance) || 0 };
}

export function interpretPassportMvdPayload(json) {
  const methodResult = json?.results?.passport_mvd?.result || {};
  const resultHttp = Number(methodResult.status) || 0;
  const data = Array.isArray(methodResult.data) ? methodResult.data[0] || {} : {};
  const rawStatus = String(
    data.status || data.doc_status || data.error || json?.error || json?.message || ''
  ).trim();
  const state = String(json?.state || '').toLowerCase();
  const hasResultData = Boolean(rawStatus) && Array.isArray(methodResult.data) && methodResult.data.length > 0;
  const finished = Number(json?.finished) === 1 || state === 'complete' || hasResultData;

  if (!finished && (PENDING_STATES.has(state) || !state)) {
    return {
      kind: 'pending',
      rawStatus: rawStatus || 'Ждём ответ МВД…',
      state: state || 'queued',
    };
  }

  if (state === 'failed' || state === 'error' || resultHttp >= 500 || isTransientRaw(rawStatus)) {
    return {
      kind: 'transient',
      rawStatus: rawStatus || 'внутренняя ошибка сервиса МВД',
      state: state || 'error',
    };
  }

  let normalized = 'unknown';
  if (/не\s*действительн/i.test(rawStatus)) normalized = 'invalid';
  else if (/действительн/i.test(rawStatus)) normalized = 'valid';
  else if (/не\s*найден/i.test(rawStatus)) normalized = 'not_found';

  return {
    kind: 'ok',
    normalized,
    rawStatus: rawStatus || 'нет данных',
    state: state || 'complete',
  };
}

function buildParams({ seria, number, firstname, lastname, secondname, dob }) {
  const params = {
    method: 'passport_mvd',
    country: 'ru',
    seria,
    number,
    firstname,
    lastname,
  };
  if (secondname) params.secondname = secondname;
  if (dob) params.dob = dob;
  return params;
}

function logCheck(requestId, parsed, extra = {}) {
  console.warn(
    '[passport-mvd]',
    JSON.stringify({
      requestId,
      kind: parsed.kind,
      state: parsed.state,
      raw: String(parsed.rawStatus || '').slice(0, 80),
      ...extra,
    })
  );
}

function toClientResult(parsed, requestId) {
  if (parsed.kind === 'pending') {
    return {
      normalized: 'pending',
      rawStatus: 'Ждём ответ МВД — в часы пик это может занять несколько минут',
      state: parsed.state || 'queued',
      requestId,
    };
  }
  if (parsed.kind === 'transient') {
    return {
      normalized: 'unavailable',
      rawStatus:
        'База МВД сейчас не отвечает (сбой сервиса, не статус паспорта). Нажмите «Проверить в МВД» ещё раз',
      state: parsed.state || 'error',
      requestId,
    };
  }
  return {
    normalized: parsed.normalized,
    rawStatus: parsed.rawStatus,
    state: parsed.state,
    requestId,
  };
}

async function submitTask(args, requestId) {
  const { json } = await newdbFetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      params: buildParams(args),
      requestId,
    }),
  });
  return json;
}

async function fetchTask(requestId) {
  const q = new URLSearchParams({
    requestId,
    token: process.env.NEWDB_API_KEY,
  });
  const { json } = await newdbFetch(`${BASE_URL}/data?${q.toString()}`);
  return json;
}

function cleanArgs({ seria, number, firstname, lastname, secondname, dob }) {
  const seriaClean = String(seria || '').replace(/\D/g, '');
  const numberClean = String(number || '').replace(/\D/g, '');
  if (seriaClean.length !== 4 || numberClean.length !== 6) {
    throw fail(400, 'Укажите серию (4 цифры) и номер (6 цифр) паспорта');
  }
  const lastnameClean = String(lastname || '').trim();
  const firstnameClean = String(firstname || '').trim();
  if (!lastnameClean || !firstnameClean) {
    throw fail(400, 'Укажите фамилию и имя продавца для проверки');
  }
  return {
    seria: seriaClean,
    number: numberClean,
    firstname: firstnameClean,
    lastname: lastnameClean,
    secondname: String(secondname || '').trim(),
    dob: toIsoDob(dob),
  };
}

export async function checkPassportValidity(body) {
  if (!passportValidityCheckConfigured()) {
    throw fail(503, 'Проверка действительности паспорта не настроена (нет ключа NewDB на сервере)');
  }
  const args = cleanArgs(body);
  const incoming = String(body.requestId || '').trim();
  const requestId = isPassportCheckRequestId(incoming) ? incoming : crypto.randomUUID();

  const json = await submitTask(args, requestId);
  const parsed = interpretPassportMvdPayload(json);
  logCheck(requestId, parsed, { phase: 'start' });
  return toClientResult(parsed, requestId);
}

export async function pollPassportValidity(requestIdRaw) {
  if (!passportValidityCheckConfigured()) {
    throw fail(503, 'Проверка действительности паспорта не настроена (нет ключа NewDB на сервере)');
  }
  const requestId = String(requestIdRaw || '').trim();
  if (!isPassportCheckRequestId(requestId)) {
    throw fail(400, 'Некорректный идентификатор проверки');
  }
  const json = await fetchTask(requestId);
  const parsed = interpretPassportMvdPayload(json);
  logCheck(requestId, parsed, { phase: 'poll' });
  return toClientResult(parsed, requestId);
}
