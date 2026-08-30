import crypto from 'crypto';

/**
 * Проверка действительности паспорта РФ по данным МВД через СМЭВ.
 * Прямого публичного сервиса МВД с 2023 года нет — используем коммерческого
 * посредника NewDB (метод passport_mvd, синхронный режим /run: держит соединение
 * до готовности ответа МВД, максимум они заявляют 3600с, у нас свой таймаут короче —
 * если МВД тормозит, оператор просто пробует ещё раз позже).
 *
 * Нужна переменная окружения NEWDB_API_KEY (токен из личного кабинета newdb.net).
 * Тариф на момент написания — 2 ₽ за проверку.
 */

const BASE_URL = 'https://api.newdb.net/v2';
const REQUEST_TIMEOUT_MS = 40_000;

export function passportValidityCheckConfigured() {
  return Boolean(process.env.NEWDB_API_KEY);
}

export async function checkPassportValidity({ seria, number, firstname, lastname, secondname, dob }) {
  if (!passportValidityCheckConfigured()) {
    const err = new Error('Проверка действительности паспорта не настроена (нет ключа NewDB на сервере)');
    err.status = 503;
    throw err;
  }
  const seriaClean = String(seria || '').replace(/\D/g, '');
  const numberClean = String(number || '').replace(/\D/g, '');
  if (seriaClean.length !== 4 || numberClean.length !== 6) {
    const err = new Error('Укажите серию (4 цифры) и номер (6 цифр) паспорта');
    err.status = 400;
    throw err;
  }
  const lastnameClean = String(lastname || '').trim();
  const firstnameClean = String(firstname || '').trim();
  if (!lastnameClean || !firstnameClean) {
    const err = new Error('Укажите фамилию и имя продавца для проверки');
    err.status = 400;
    throw err;
  }

  const q = new URLSearchParams({
    method: 'passport_mvd',
    seria: seriaClean,
    number: numberClean,
    country: 'ru',
    firstname: firstnameClean,
    lastname: lastnameClean,
    token: process.env.NEWDB_API_KEY,
    requestId: crypto.randomUUID(),
  });
  const secondnameClean = String(secondname || '').trim();
  if (secondnameClean) q.set('secondname', secondnameClean);
  const dobClean = String(dob || '').trim();
  if (dobClean) q.set('dob', dobClean);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}/run?${q.toString()}`, { signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('МВД не ответило за отведённое время. Попробуйте проверить ещё раз через пару минут');
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`NewDB вернул не-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Ошибка проверки (${res.status})`);
  }
  if (json?.state === 'timeout') {
    const err = new Error('МВД не ответило вовремя, попробуйте ещё раз через пару минут');
    err.status = 504;
    throw err;
  }

  const data = json?.results?.passport_mvd?.result?.data?.[0] || {};
  const rawStatus = String(data.status || data.doc_status || data.error || '').trim();
  let normalized = 'unknown';
  if (/недействительн/i.test(rawStatus)) normalized = 'invalid';
  else if (/действительн/i.test(rawStatus)) normalized = 'valid';
  else if (/не\s*найден/i.test(rawStatus)) normalized = 'not_found';

  return {
    normalized,
    rawStatus: rawStatus || 'нет данных',
    state: json?.state || 'unknown',
  };
}
