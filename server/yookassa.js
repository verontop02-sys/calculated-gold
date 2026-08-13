/**
 * ЮKassa (тестовый / боевой магазин): создание платежа на пополнение
 * fintech-баланса, привязка карты (save_payment_method), безакцептное списание
 * и зачисление по webhook / явному confirm.
 *
 * Auth: Basic shopId:secretKey → https://api.yookassa.ru/v3
 * Идемпотентность зачисления: ledger key `yookassa:<paymentId>`.
 */
import crypto from 'crypto';
import { depositFromAcquiring } from './fintechLedger.js';

const API = 'https://api.yookassa.ru/v3';

const TOPUP_PURPOSES = new Set(['fintech_topup', 'fintech_bind', 'fintech_recurring_charge']);

export function yookassaConfigured() {
  return Boolean(String(process.env.YOOKASSA_SHOP_ID || '').trim() && String(process.env.YOOKASSA_SECRET_KEY || '').trim());
}

function shopId() {
  return String(process.env.YOOKASSA_SHOP_ID || '').trim();
}

function secretKey() {
  return String(process.env.YOOKASSA_SECRET_KEY || '').trim();
}

export function minTopupRub() {
  const n = Number(process.env.YOOKASSA_MIN_TOPUP_RUB || 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function maxTopupRub() {
  const n = Number(process.env.YOOKASSA_MAX_TOPUP_RUB || 5_000_000);
  return Number.isFinite(n) && n > 0 ? n : 5_000_000;
}

function authHeader() {
  const token = Buffer.from(`${shopId()}:${secretKey()}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

async function yooFetch(path, { method = 'GET', body, idempotenceKey } = {}) {
  if (!yookassaConfigured()) {
    const err = new Error('Эквайринг ЮKassa не настроен (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)');
    err.status = 503;
    throw err;
  }
  const headers = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
  };
  if (idempotenceKey) headers['Idempotence-Key'] = String(idempotenceKey).slice(0, 64);

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const desc = data?.description || data?.message || text || res.statusText;
    const err = new Error(`ЮKassa: ${desc}`);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.yookassa = data;
    throw err;
  }
  return data;
}

export async function getYooPayment(paymentId) {
  return yooFetch(`/payments/${encodeURIComponent(paymentId)}`);
}

function cardMetaFromPaymentMethod(pm) {
  if (!pm || typeof pm !== 'object') return { last4: null, cardType: null };
  const last4 = pm.card?.last4 || pm.card?.card_last4 || null;
  const cardType = pm.card?.card_type || pm.type || null;
  return {
    last4: last4 ? String(last4) : null,
    cardType: cardType ? String(cardType) : null,
  };
}

/** Сохранить payment_method.id клиента и проставить на активную подписку (если есть). */
export async function persistYooPaymentMethod(supabase, clientId, payment) {
  const pm = payment?.payment_method;
  if (!pm?.id || !pm.saved) return null;
  const { last4, cardType } = cardMetaFromPaymentMethod(pm);
  const methodId = String(pm.id);

  const { data: row, error } = await supabase
    .from('fintech_payment_methods')
    .upsert(
      {
        client_id: clientId,
        provider: 'yookassa',
        method_id: methodId,
        card_last4: last4,
        card_type: cardType,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,method_id' },
    )
    .select('id, method_id, card_last4, card_type, status')
    .maybeSingle();
  if (error) {
    console.warn('[yookassa] persist method', error.message || error);
    return null;
  }

  // Обновляем подписку, если клиент уже настроил регулярку / привязку под bind.
  await supabase
    .from('fintech_recurring_investments')
    .update({
      yoo_payment_method_id: methodId,
      card_last4: last4,
      card_type: cardType,
      updated_at: new Date().toISOString(),
    })
    .eq('client_id', clientId);

  return row;
}

/**
 * Создать платёж с redirect-confirmation.
 * savePaymentMethod=true — привязка карты для автоплатежей (и зачисление суммы).
 */
export async function createTopupPayment(supabase, {
  clientId,
  rubAmount,
  returnUrl,
  description,
  customerEmail,
  savePaymentMethod = false,
  purpose = 'fintech_topup',
}) {
  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const min = minTopupRub();
  const max = maxTopupRub();
  if (!Number.isFinite(amount) || amount < min) {
    const err = new Error(`Минимальная сумма пополнения — ${min} ₽`);
    err.status = 400;
    throw err;
  }
  if (amount > max) {
    const err = new Error(`Максимальная сумма пополнения — ${max.toLocaleString('ru-RU')} ₽`);
    err.status = 400;
    throw err;
  }
  if (!returnUrl || !/^https?:\/\//i.test(String(returnUrl))) {
    const err = new Error('Некорректный return_url');
    err.status = 400;
    throw err;
  }
  const purposeSafe = TOPUP_PURPOSES.has(purpose) ? purpose : 'fintech_topup';

  const { data: client, error: cErr } = await supabase
    .from('fintech_clients')
    .select('id, status, email, full_name')
    .eq('id', clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }
  if (client.status !== 'approved') {
    const err = new Error('Пополнение доступно после подтверждения документов');
    err.status = 403;
    err.code = 'fintech_not_approved';
    throw err;
  }

  const value = amount.toFixed(2);
  const idempotenceKey = crypto.randomUUID();
  const email = String(customerEmail || client.email || '').trim();

  const body = {
    amount: { value, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: String(returnUrl),
    },
    description: String(
      description
        || (savePaymentMethod
          ? `Привязка карты и пополнение Reaktivo ${value} руб.`
          : `Пополнение лицевого счета Reaktivo ${value} руб.`),
    )
      .replace(/₽/g, 'руб.')
      .replace(/золотого?\s+сч[её]та/gi, 'лицевого счета')
      .slice(0, 128),
    metadata: {
      clientId: String(clientId),
      purpose: purposeSafe,
      rubAmount: value,
      savePaymentMethod: savePaymentMethod ? '1' : '0',
    },
  };
  if (savePaymentMethod) body.save_payment_method = true;

  if (process.env.YOOKASSA_SEND_RECEIPT === '1' && email) {
    body.receipt = {
      customer: { email },
      items: [
        {
          description: savePaymentMethod ? 'Привязка карты / пополнение Reaktivo' : 'Пополнение лицевого счета Reaktivo',
          quantity: '1.00',
          amount: { value, currency: 'RUB' },
          vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1),
          payment_mode: 'full_payment',
          payment_subject: 'service',
        },
      ],
    };
  }

  const payment = await yooFetch('/payments', { method: 'POST', body, idempotenceKey });
  const confirmationUrl = payment?.confirmation?.confirmation_url || null;
  if (!confirmationUrl) {
    const err = new Error('ЮKassa не вернула ссылку на оплату');
    err.status = 502;
    throw err;
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    amountRub: amount,
    confirmationUrl,
    test: Boolean(payment.test),
    savePaymentMethod: Boolean(savePaymentMethod),
  };
}

/** Безакцептное списание по сохранённому payment_method_id (автопополнение). */
export async function chargeSavedMethod({
  clientId,
  paymentMethodId,
  rubAmount,
  description,
  idempotenceKey,
  purpose = 'fintech_recurring_charge',
}) {
  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const min = minTopupRub();
  if (!Number.isFinite(amount) || amount < min) {
    const err = new Error(`Минимальная сумма списания — ${min} ₽`);
    err.status = 400;
    throw err;
  }
  const methodId = String(paymentMethodId || '').trim();
  if (!methodId) {
    const err = new Error('Нет сохранённого способа оплаты');
    err.status = 400;
    throw err;
  }
  const value = amount.toFixed(2);
  const purposeSafe = TOPUP_PURPOSES.has(purpose) ? purpose : 'fintech_recurring_charge';

  const body = {
    amount: { value, currency: 'RUB' },
    capture: true,
    payment_method_id: methodId,
    description: String(description || `Пополнение лицевого счета Reaktivo ${value} руб.`)
      .replace(/₽/g, 'руб.')
      .slice(0, 128),
    metadata: {
      clientId: String(clientId),
      purpose: purposeSafe,
      rubAmount: value,
    },
  };

  const payment = await yooFetch('/payments', {
    method: 'POST',
    body,
    idempotenceKey: idempotenceKey || crypto.randomUUID(),
  });

  return {
    paymentId: payment.id,
    status: payment.status,
    amountRub: amount,
    test: Boolean(payment.test),
    payment,
  };
}

/**
 * Зачислить платёж на баланс, если succeeded. Безопасно вызывать повторно
 * (webhook + return URL confirm): ledger idempotency по payment.id.
 */
export async function creditYooPaymentIfSucceeded(supabase, paymentOrId) {
  const payment = typeof paymentOrId === 'string'
    ? await getYooPayment(paymentOrId)
    : paymentOrId;

  if (!payment?.id) {
    const err = new Error('Платёж не найден');
    err.status = 404;
    throw err;
  }

  const verified = await getYooPayment(payment.id);
  if (verified.status !== 'succeeded') {
    return {
      ok: false,
      credited: false,
      status: verified.status,
      paymentId: verified.id,
    };
  }

  const meta = verified.metadata || {};
  const clientId = String(meta.clientId || '').trim();
  const purpose = String(meta.purpose || '');
  if (!clientId || !TOPUP_PURPOSES.has(purpose)) {
    const err = new Error('Платёж не относится к пополнению fintech');
    err.status = 400;
    throw err;
  }

  const paid = Number(verified.amount?.value);
  if (!Number.isFinite(paid) || paid <= 0) {
    const err = new Error('Некорректная сумма платежа');
    err.status = 400;
    throw err;
  }

  const out = await depositFromAcquiring(supabase, {
    clientId,
    rubAmount: paid,
    paymentId: verified.id,
    provider: 'yookassa',
    detail: {
      yookassaPaymentId: verified.id,
      paidAt: verified.captured_at || verified.created_at,
      test: Boolean(verified.test),
      method: verified.payment_method?.type || null,
      purpose,
    },
  });

  const savedMethod = await persistYooPaymentMethod(supabase, clientId, verified);

  return {
    ok: true,
    credited: !out.duplicate,
    duplicate: Boolean(out.duplicate),
    status: 'succeeded',
    paymentId: verified.id,
    rubBalance: out.rubBalance,
    goldGrams: out.goldGrams,
    amountRub: paid,
    paymentMethod: savedMethod
      ? {
          id: savedMethod.method_id,
          last4: savedMethod.card_last4,
          cardType: savedMethod.card_type,
        }
      : null,
  };
}

/** Обработка HTTP-уведомления ЮKassa. Всегда лучше отвечать 200 после обработки. */
export async function handleYooWebhook(supabase, body) {
  const event = body?.event;
  const object = body?.object;
  if (!event || !object?.id) {
    return { ok: true, ignored: true };
  }
  if (event === 'payment.succeeded') {
    const result = await creditYooPaymentIfSucceeded(supabase, object.id);
    return { ok: true, event, ...result };
  }
  return { ok: true, event, ignored: true };
}
