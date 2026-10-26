/**
 * Отправка СМС для полевого подтверждения сделки.
 * SMSRU_API_ID — https://sms.ru (параметр api_id в .env).
 * SMSRU_FROM — опционально: согласованное имя отправителя (латиница, до 11 символов).
 * Иначе stub: лог в консоль (dev) / server logs (prod).
 */

function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 4) return '***';
  return `***${d.slice(-4)}`;
}

function enrichSmsError(err, providerData) {
  const msg = String(err?.message || '').toLowerCase();
  const statusText = String(providerData?.status_text || '').toLowerCase();
  const text = `${msg} ${statusText}`;
  if (/не хватает средств|insufficient|balance/.test(text)) {
    err.status = 402;
    err.publicMessage = 'СМС временно недоступна: недостаточно средств у провайдера. Обратитесь к администратору.';
  }
  return err;
}

/** Подтверждение заявки с сайта. Опечатку в черновике (Reakrivo) не отправляем. */
export const LEAD_ACK_SMS = [
  'Здравствуйте! Вы оставили заявку на нашем сайте Reaktivo.ru',
  'Мы уже занимаемся вашим заказом и скоро позвоним.',
  'Тел. менеджера 8 993 633 01 01',
  'С уважением, команда Reaktivo',
].join('\n');

/** Смс после записи курьера: дата, время и звонок за час. */
export function courierBookingSms({ dateLabel, time } = {}) {
  const when = [String(dateLabel || '').trim(), String(time || '').trim()].filter(Boolean).join(', ');
  const booked = when
    ? `Reaktivo — курьер забронирован. ${when}.`
    : 'Reaktivo — курьер забронирован.';
  return `${booked} Курьер позвонит за 1 час до визита для подтверждения. https://reaktivo.ru/kurier/`;
}

/** 7XXXXXXXXXX или пусто, если это не российский мобильный. */
export function leadSmsDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith('9')) d = `7${d}`;
  if (d.length !== 11 || !d.startsWith('79')) return '';
  return d;
}

export async function sendDealConfirmationSms({ to, text }) {
  const apiId = (process.env.SMSRU_API_ID || '').trim();
  if (apiId) {
    const { default: axios } = await import('axios');
    const toDigits = to.replace(/\D/g, '');
    const u = new URL('https://sms.ru/sms/send');
    u.searchParams.set('json', '1');
    u.searchParams.set('api_id', apiId);
    u.searchParams.set('to', toDigits);
    u.searchParams.set('msg', text);
    const from = (process.env.SMSRU_FROM || '').trim();
    if (from) u.searchParams.set('from', from);
    const { data } = await axios.get(u.toString(), { timeout: 20_000 });
    const row = data?.sms?.[toDigits] || data?.sms?.[toDigits.replace(/^7/, '')] || null;
    if (data?.status !== 'OK' && data?.status_code !== 100) {
      const err = new Error(data?.status_text || data?.error || 'SMS provider error');
      err.smsDebug = data;
      throw enrichSmsError(err, data);
    }
    if (row && Number(row.status_code) !== 100) {
      const err = new Error(row.status_text || 'SMS provider error');
      err.smsDebug = data;
      throw enrichSmsError(err, data);
    }
    return {
      ok: true,
      provider: 'sms.ru',
      statusCode: Number(row?.status_code || data?.status_code || 100),
      smsId: row?.sms_id || null,
    };
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const line = `[SMS stub → ${maskPhone(to)}] ${text.replace(/\d{4,8}/g, '******')}`;
  if (isDev) console.info(line);
  else console.info(line);
  return { ok: true, provider: 'stub' };
}
