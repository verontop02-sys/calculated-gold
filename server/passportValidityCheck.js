import crypto from 'crypto';

/**
 * Проверка действительности паспорта РФ по данным МВД через СМЭВ.
 * Прямого публичного сервиса МВД с 2023 года нет — используем коммерческого
 * посредника NewDB (метод passport_mvd, синхронный режим /run: держит соединение
 * до готовности ответа МВД).
 *
 * Нужна переменная окружения NEWDB_API_KEY (токен из личного кабинета newdb.net).
 * Тариф на момент написания — 2 ₽ за проверку.
 */

const BASE_URL = 'https://api.newdb.net/v2';
const ATTEMPT_TIMEOUT_MS = 22_000;
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 1_200;

const TRANSIENT_RE =
  /внутренн|unavailable|недоступ|ошибка сервиса|service error|try again|повторит|timeout|таймаут|временно/i;

export function passportValidityCheckConfigured() {
  return Boolean(process.env.NEWDB_API_KEY);
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return '';
}

function isTransientRaw(raw) {
  return TRANSIENT_RE.test(String(raw || ''));
}

/**
 * Баланс аккаунта NewDB (₽). Проверки платные (≈2₽/шт) — виджет для админа,
 * чтобы пополнить заранее и не остаться без проверки посреди ключевой сделки.
 */
export async function getNewDbBalance() {
  if (!passportValidityCheckConfigured()) {
    throw fail(503, 'NEWDB_API_KEY не настроен на сервере');
  }
  const res = await fetch(`${BASE_URL}/balance`, {
    headers: { 'X-API-KEY': process.env.NEWDB_API_KEY },
  });
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

function interpretPayload(json) {
  const methodResult = json?.results?.passport_mvd?.result || {};
  const resultHttp = Number(methodResult.status) || 0;
  const data = Array.isArray(methodResult.data) ? methodResult.data[0] || {} : {};
  const rawStatus = String(
    data.status || data.doc_status || data.error || json?.error || json?.message || ''
  ).trim();
  const state = String(json?.state || '').toLowerCase();

  if (state === 'timeout') return { kind: 'timeout', rawStatus, state };
  if (
    state === 'error' ||
    resultHttp >= 500 ||
    isTransientRaw(rawStatus)
  ) {
    return { kind: 'transient', rawStatus: rawStatus || 'внутренняя ошибка сервиса МВД', state };
  }

  let normalized = 'unknown';
  if (/недействительн/i.test(rawStatus)) normalized = 'invalid';
  else if (/действительн/i.test(rawStatus)) normalized = 'valid';
  else if (/не\s*найден/i.test(rawStatus)) normalized = 'not_found';

  return {
    kind: 'ok',
    normalized,
    rawStatus: rawStatus || 'нет данных',
    state: state || 'unknown',
  };
}

async function runOnce({ seria, number, firstname, lastname, secondname, dob }) {
  const requestId = crypto.randomUUID();
  const q = new URLSearchParams({
    method: 'passport_mvd',
    seria,
    number,
    country: 'ru',
    firstname,
    lastname,
    token: process.env.NEWDB_API_KEY,
    requestId,
  });
  if (secondname) q.set('secondname', secondname);
  if (dob) q.set('dob', dob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}/run?${q.toString()}`, {
      signal: controller.signal,
      headers: { 'X-API-KEY': process.env.NEWDB_API_KEY },
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw fail(504, 'МВД не ответило за отведённое время. Нажмите «Проверить в МВД» ещё раз через минуту');
    }
    throw fail(502, 'Не удалось связаться с сервисом проверки паспортов. Попробуйте ещё раз через минуту');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
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
    if (res.status >= 500 || isTransientRaw(msg)) {
      const err = fail(502, msg || `Сервис МВД временно недоступен (${res.status})`);
      err.transient = true;
      throw err;
    }
    throw fail(502, msg || `Ошибка проверки паспорта (${res.status})`);
  }

  const parsed = interpretPayload(json);
  console.warn(
    '[passport-mvd]',
    JSON.stringify({
      requestId,
      http: res.status,
      state: parsed.state || json?.state,
      kind: parsed.kind,
      raw: String(parsed.rawStatus || '').slice(0, 80),
    })
  );
  return parsed;
}

export async function checkPassportValidity({ seria, number, firstname, lastname, secondname, dob }) {
  if (!passportValidityCheckConfigured()) {
    throw fail(503, 'Проверка действительности паспорта не настроена (нет ключа NewDB на сервере)');
  }
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
  const secondnameClean = String(secondname || '').trim();
  const dobClean = toIsoDob(dob);

  const args = {
    seria: seriaClean,
    number: numberClean,
    firstname: firstnameClean,
    lastname: lastnameClean,
    secondname: secondnameClean,
    dob: dobClean,
  };

  let lastTransient = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const parsed = await runOnce(args);
      if (parsed.kind === 'timeout') {
        throw fail(504, 'МВД не ответило вовремя. Нажмите «Проверить в МВД» ещё раз через минуту');
      }
      if (parsed.kind === 'transient') {
        lastTransient = parsed.rawStatus;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_PAUSE_MS);
          continue;
        }
        return {
          normalized: 'unavailable',
          rawStatus:
            'База МВД сейчас не отвечает (сбой сервиса, не статус паспорта). Нажмите «Проверить в МВД» ещё раз через минуту',
          state: parsed.state || 'error',
        };
      }
      return {
        normalized: parsed.normalized,
        rawStatus: parsed.rawStatus,
        state: parsed.state,
      };
    } catch (e) {
      // Повторяем только быстрый сбой NewDB/СМЭВ. Таймаут 22с не крутим ещё раз —
      // иначе оператор будет ждать минуту, а клиентский запрос уже оборвётся.
      if (e?.transient && attempt < MAX_ATTEMPTS) {
        lastTransient = e.message;
        await sleep(RETRY_PAUSE_MS);
        continue;
      }
      throw e;
    }
  }

  return {
    normalized: 'unavailable',
    rawStatus:
      lastTransient ||
      'База МВД сейчас не отвечает. Нажмите «Проверить в МВД» ещё раз через минуту',
    state: 'error',
  };
}
