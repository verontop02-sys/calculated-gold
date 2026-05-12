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
