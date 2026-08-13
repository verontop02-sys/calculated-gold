/**
 * Заявки на вывод средств fintech-кабинета.
 *
 * Пока нет интеграции с A7/ПСБ (см. ТЗ этапа 9), выплата — ручной процесс:
 * 1. Клиент подаёт заявку на сумму → деньги СРАЗУ списываются с рублёвого баланса
 *    через ledger (entry_type='withdraw_rub'), чтобы их нельзя было потратить
 *    повторно на покупку золота, пока заявка висит на модерации.
 * 2. Модератор переводит деньги клиенту вне системы (на карту/по реквизитам)
 *    и отмечает заявку «Оплачено» — либо отклоняет, тогда полная сумма
 *    возвращается клиенту компенсирующей записью (entry_type='correction').
 * 3. Клиент может отменить заявку, пока она не выплачена (pending/approved) —
 *    сумма также возвращается на баланс (status=cancelled).
 *
 * Комиссия за вывод и минимальная сумма — в тех же fintech_settings, что и
 * комиссии покупки/продажи (см. fintechLedger.js), чтобы всё настраивалось
 * из одного места в админке.
 */
import crypto from 'crypto';
import { getFintechSettings } from './fintechLedger.js';
import { sendFintechWithdrawalEmailIfConfigured } from './emailDealReceipt.js';
import { sendTelegramMessage } from './telegramNotify.js';

async function getApprovedClient(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, status, email, full_name, phone_normalized')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) {
    const err = new Error('Клиент не найден');
    err.status = 404;
    throw err;
  }
  if (client.status !== 'approved') {
    const err = new Error('Кабинет доступен после подтверждения документов модератором');
    err.status = 403;
    err.code = 'fintech_not_approved';
    throw err;
  }
  return client;
}

function formatMoneyRub(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

function withdrawalNotifyChatId() {
  return (
    process.env.TELEGRAM_WITHDRAWALS_CHAT_ID ||
    process.env.TELEGRAM_LEADS_CHAT_ID ||
    process.env.TELEGRAM_SUPPORT_CHAT_ID ||
    ''
  ).trim();
}

/** Best-effort: новая заявка / отмена клиентом → в Telegram операторам. */
async function notifyWithdrawalTelegram(text) {
  const chatId = withdrawalNotifyChatId();
  if (!chatId) {
    console.warn('[fintech withdraw tg] skip: TELEGRAM_SUPPORT_CHAT_ID not set');
    return { sent: false, reason: 'not_configured' };
  }
  return sendTelegramMessage(chatId, text);
}

function buildPayoutDetails({ payoutDetails, payoutMethod, cardNumber, sbpPhone, recipientName }) {
  const raw = String(payoutDetails || '').trim();
  if (raw) return { details: raw.slice(0, 500), method: 'freeform', cardMasked: null, phone: null, recipientName: null };

  const method = payoutMethod === 'sbp' ? 'sbp' : 'card';
  const name = String(recipientName || '').trim().slice(0, 120);
  if (method === 'card') {
    const card = String(cardNumber || '').replace(/\D/g, '');
    if (card.length < 16 || card.length > 19) {
      const err = new Error('Введите номер карты полностью (16–19 цифр)');
      err.status = 400;
      throw err;
    }
    const grouped = card.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    const masked = `${card.slice(0, 4)} ···· ···· ${card.slice(-4)}`;
    const details = [`Карта ${grouped}`, name ? `получатель ${name}` : null].filter(Boolean).join(' · ').slice(0, 500);
    return { details, method: 'card', cardMasked: masked, phone: null, recipientName: name || null };
  }

  const phone = String(sbpPhone || '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 11) {
    const err = new Error('Введите телефон СБП в формате +7 XXX XXX-XX-XX');
    err.status = 400;
    throw err;
  }
  const norm = phone.length === 10 ? `7${phone}` : phone;
  const pretty = `+${norm[0]} ${norm.slice(1, 4)} ${norm.slice(4, 7)}-${norm.slice(7, 9)}-${norm.slice(9)}`;
  const details = [`СБП ${pretty}`, name ? `получатель ${name}` : null].filter(Boolean).join(' · ').slice(0, 500);
  return { details, method: 'sbp', cardMasked: null, phone: pretty, recipientName: name || null };
}

/**
 * Возврат полной суммы заявки на рублёвый баланс (отклонение / отмена).
 * Идемпотентно по key — повторный вызов не задвоит деньги.
 */
async function refundWithdrawalAmount(supabase, {
  request,
  createdByType,
  createdById,
  idempotencyKey,
  detail,
}) {
  const { data: refund, error: refundErr } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: request.client_id,
    p_entry_type: 'correction',
    p_rub_delta: Number(request.rub_amount),
    p_gold_grams_delta: 0,
    p_rate_rub_per_gram: null,
    p_fee_rub: 0,
    p_idempotency_key: idempotencyKey,
    p_created_by_type: createdByType,
    p_created_by_id: createdById,
    p_detail: detail,
    p_reversal_of: request.ledger_entry_id,
  });
  if (refundErr) throw refundErr;
  return Array.isArray(refund) ? refund[0] : refund;
}

/** Подать заявку на вывод: списывает деньги с баланса и создаёт заявку в статусе pending. */
export async function requestWithdrawal(supabase, {
  clientId,
  rubAmount,
  payoutDetails,
  payoutMethod,
  cardNumber,
  sbpPhone,
  recipientName,
  idempotencyKey,
}) {
  const client = await getApprovedClient(supabase, clientId);
  const settings = await getFintechSettings(supabase);

  const amount = Math.round(Number(rubAmount) * 100) / 100;
  const minRub = Number(settings.minWithdrawRub || 0) || 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Укажите сумму вывода больше нуля');
    err.status = 400;
    throw err;
  }
  if (amount < minRub) {
    const err = new Error(`Минимальная сумма вывода — ${minRub.toLocaleString('ru-RU')} ₽`);
    err.status = 400;
    throw err;
  }
  const payout = buildPayoutDetails({ payoutDetails, payoutMethod, cardNumber, sbpPhone, recipientName });
  const details = payout.details;
  if (!details) {
    const err = new Error('Укажите реквизиты для перевода (карта или телефон СБП)');
    err.status = 400;
    throw err;
  }

  const feePct = Number(settings.withdrawFeePercent || 0) || 0;
  const feeRub = Math.round(amount * (feePct / 100) * 100) / 100;
  const netRub = Math.round((amount - feeRub) * 100) / 100;

  const key = idempotencyKey ? `withdraw_req:${clientId}:${idempotencyKey}` : `withdraw_req:${clientId}:${crypto.randomUUID()}`;

  // Списание сразу — иначе клиент мог бы потратить эти деньги на покупку золота,
  // пока заявка ждёт модерации (двойное расходование одной и той же суммы).
  const { data, error } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: clientId,
    p_entry_type: 'withdraw_rub',
    p_rub_delta: -amount,
    p_gold_grams_delta: 0,
    p_rate_rub_per_gram: null,
    p_fee_rub: feeRub,
    p_idempotency_key: key,
    p_created_by_type: 'client',
    p_created_by_id: clientId,
    p_detail: {
      payoutDetails: details,
      payoutMethod: payout.method,
      cardMasked: payout.cardMasked,
      sbpPhone: payout.phone,
      recipientName: payout.recipientName,
    },
    p_reversal_of: null,
  });
  if (error) {
    if (String(error.message || '').includes('insufficient_balance')) {
      const err = new Error('Недостаточно средств на рублёвом балансе');
      err.status = 400;
      throw err;
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;

  const { data: request, error: reqErr } = await supabase
    .from('fintech_withdrawal_requests')
    .insert({
      client_id: clientId,
      rub_amount: amount,
      fee_rub: feeRub,
      net_rub: netRub,
      payout_details: details,
      status: 'pending',
      ledger_entry_id: row.entry_id,
    })
    .select('id, rub_amount, fee_rub, net_rub, status, payout_details, created_at')
    .single();
  if (reqErr) throw reqErr;

  const phone = client.phone_normalized
    ? (String(client.phone_normalized).startsWith('7')
      ? `+${client.phone_normalized}`
      : client.phone_normalized)
    : '—';
  const tgLines = [
    '💸 Новая заявка на вывод Reaktivo',
    `Клиент: ${client.full_name || 'без имени'} · ${phone}`,
    client.email ? `Email: ${client.email}` : null,
    `Сумма: ${formatMoneyRub(amount)}${feeRub ? ` (комиссия ${formatMoneyRub(feeRub)}, к выплате ${formatMoneyRub(netRub)})` : ''}`,
    `Реквизиты: ${details}`,
    `ID: ${request.id}`,
    'Админка → Fintech → Выводы',
  ].filter(Boolean);
  // Ждём TG до ответа — на free Render fire-and-forget может оборваться.
  await notifyWithdrawalTelegram(tgLines.join('\n')).catch((e) =>
    console.warn('[fintech withdraw tg]', e?.message || e)
  );

  return {
    ok: true,
    request: mapRequest(request),
    rubBalance: Number(row.rub_balance),
    goldGrams: Number(row.gold_grams),
  };
}

function mapRequest(r) {
  const rejectReason = r.reject_reason || null;
  let status = r.status;
  // Клиентская отмена хранится как rejected до миграции cancelled.
  if (status === 'rejected' && rejectReason === 'Отменено клиентом') {
    status = 'cancelled';
  }
  return {
    id: r.id,
    rubAmount: Number(r.rub_amount),
    feeRub: Number(r.fee_rub) || 0,
    netRub: Number(r.net_rub),
    payoutDetails: r.payout_details,
    status,
    rejectReason,
    decidedAt: r.decided_at || null,
    createdAt: r.created_at,
  };
}

/** Заявки клиента — для вкладки «Продать/Вывод» в кабинете. */
export async function getClientWithdrawals(supabase, clientId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('fintech_withdrawal_requests')
    .select('id, rub_amount, fee_rub, net_rub, payout_details, status, reject_reason, decided_at, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapRequest);
}

/**
 * Клиент отменяет свою заявку (pending/approved) → полная сумма на баланс.
 * Пишем status=rejected + «Отменено клиентом» (текущий check constraint).
 * После миграции 20260813180000 можно переключить на cancelled.
 */
export async function cancelWithdrawal(supabase, { requestId, clientId }) {
  const { data: request, error } = await supabase
    .from('fintech_withdrawal_requests')
    .select('id, client_id, rub_amount, status, ledger_entry_id, payout_details, fee_rub, net_rub')
    .eq('id', requestId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!request) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }
  if (request.status === 'paid') {
    const err = new Error('Заявка уже выплачена — отмена невозможна');
    err.status = 400;
    throw err;
  }
  if (request.status === 'rejected' || request.status === 'cancelled') {
    const err = new Error('Заявка уже закрыта');
    err.status = 400;
    throw err;
  }
  if (request.status !== 'pending' && request.status !== 'approved') {
    const err = new Error('Эту заявку нельзя отменить');
    err.status = 400;
    throw err;
  }

  // Сначала «забираем» заявку (гонка с paid/reject), потом возвращаем деньги.
  const { data: claimed, error: claimErr } = await supabase
    .from('fintech_withdrawal_requests')
    .update({
      status: 'rejected',
      reject_reason: 'Отменено клиентом',
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('client_id', clientId)
    .in('status', ['pending', 'approved'])
    .select('id, rub_amount, fee_rub, net_rub, status, payout_details, reject_reason, decided_at, created_at, ledger_entry_id, client_id')
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) {
    const err = new Error('Заявка уже обработана менеджером — обновите страницу');
    err.status = 409;
    throw err;
  }

  const refundRow = await refundWithdrawalAmount(supabase, {
    request: claimed,
    createdByType: 'client',
    createdById: clientId,
    idempotencyKey: `withdraw_cancel:${claimed.id}`,
    detail: { reason: 'withdrawal_cancelled_by_client', withdrawalRequestId: claimed.id },
  });

  const { data: updated, error: updErr } = await supabase
    .from('fintech_withdrawal_requests')
    .update({ refund_ledger_entry_id: refundRow.entry_id })
    .eq('id', claimed.id)
    .select('id, rub_amount, fee_rub, net_rub, status, payout_details, reject_reason, decided_at, created_at')
    .single();
  if (updErr) throw updErr;

  const { data: client } = await supabase
    .from('fintech_clients')
    .select('full_name, phone_normalized, email')
    .eq('id', clientId)
    .maybeSingle();
  const phone = client?.phone_normalized
    ? (String(client.phone_normalized).startsWith('7')
      ? `+${client.phone_normalized}`
      : client.phone_normalized)
    : '—';
  await notifyWithdrawalTelegram([
    '↩️ Заявка на вывод отменена клиентом',
    `Клиент: ${client?.full_name || 'без имени'} · ${phone}`,
    `Сумма ${formatMoneyRub(request.rub_amount)} возвращена на баланс`,
    `ID: ${request.id}`,
  ].join('\n')).catch((e) => console.warn('[fintech withdraw cancel tg]', e?.message || e));

  return {
    ok: true,
    request: mapRequest(updated),
    rubBalance: Number(refundRow.rub_balance),
    goldGrams: Number(refundRow.gold_grams),
  };
}

/** Список заявок для модерации (админка). status=all — без фильтра. */
export async function listWithdrawalRequests(supabase, { status, limit = 100, offset = 0 } = {}) {
  let query = supabase
    .from('fintech_withdrawal_requests')
    .select('id, client_id, rub_amount, fee_rub, net_rub, payout_details, status, reject_reason, decided_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const st = status == null ? '' : String(status).trim();
  if (!st || st === 'pending') {
    query = query.eq('status', 'pending');
  } else if (st === 'cancelled' || st === 'rejected') {
    // Оба хранятся как rejected до миграции cancelled — разделим после выборки
    query = query.eq('status', 'rejected');
  } else if (st !== 'all' && st !== '*') {
    query = query.eq('status', st);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  let rows = data || [];
  if (st === 'cancelled') {
    rows = rows.filter((r) => r.reject_reason === 'Отменено клиентом');
  } else if (st === 'rejected') {
    rows = rows.filter((r) => r.reject_reason !== 'Отменено клиентом');
  }

  const ids = [...new Set(rows.map((r) => r.client_id))];
  let clientsById = new Map();
  if (ids.length) {
    const { data: clients, error: cErr } = await supabase
      .from('fintech_clients')
      .select('id, full_name, phone_normalized, email')
      .in('id', ids);
    if (cErr) throw cErr;
    clientsById = new Map((clients || []).map((c) => [c.id, c]));
  }

  return {
    total: st === 'cancelled' || st === 'rejected' ? rows.length : (count || 0),
    requests: rows.map((r) => ({
      ...mapRequest(r),
      client: clientsById.has(r.client_id)
        ? {
            id: r.client_id,
            fullName: clientsById.get(r.client_id).full_name,
            phone: clientsById.get(r.client_id).phone_normalized,
            email: clientsById.get(r.client_id).email,
          }
        : { id: r.client_id },
    })),
  };
}

/**
 * Решение модератора по заявке: approved (принята в обработку), paid (деньги
 * переведены клиенту вне системы), rejected (сумма возвращается на баланс).
 */
export async function decideWithdrawal(supabase, { requestId, decision, staffId, rejectReason }) {
  if (!['approved', 'paid', 'rejected'].includes(decision)) {
    const err = new Error('Некорректное решение');
    err.status = 400;
    throw err;
  }

  const { data: request, error } = await supabase
    .from('fintech_withdrawal_requests')
    .select('id, client_id, rub_amount, status, ledger_entry_id, payout_details, fee_rub, net_rub')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) {
    const err = new Error('Заявка не найдена');
    err.status = 404;
    throw err;
  }
  if (request.status === 'paid' || request.status === 'rejected' || request.status === 'cancelled') {
    const err = new Error('Заявка уже закрыта');
    err.status = 400;
    throw err;
  }
  if (decision === 'approved' && request.status !== 'pending') {
    const err = new Error('В обработку можно взять только новую заявку');
    err.status = 400;
    throw err;
  }
  if (decision === 'paid' && request.status !== 'pending' && request.status !== 'approved') {
    const err = new Error('Отметить оплаченной можно только открытую заявку');
    err.status = 400;
    throw err;
  }

  const patch = {
    status: decision,
    decided_by: staffId,
    decided_at: new Date().toISOString(),
  };

  if (decision === 'rejected') {
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      const err = new Error('Укажите причину отклонения');
      err.status = 400;
      throw err;
    }
    patch.reject_reason = reason;
  }

  const allowedFrom = decision === 'approved' ? ['pending'] : ['pending', 'approved'];
  const { data: updated, error: updErr } = await supabase
    .from('fintech_withdrawal_requests')
    .update(patch)
    .eq('id', requestId)
    .in('status', allowedFrom)
    .select('id')
    .maybeSingle();
  if (updErr) throw updErr;
  if (!updated) {
    const err = new Error('Заявка уже изменена — обновите список');
    err.status = 409;
    throw err;
  }

  if (decision === 'rejected') {
    // Возвращаем клиенту полную списанную сумму после успешного claim статуса.
    const refundRow = await refundWithdrawalAmount(supabase, {
      request,
      createdByType: 'staff',
      createdById: staffId,
      idempotencyKey: `withdraw_reject:${request.id}`,
      detail: { reason: 'withdrawal_rejected', withdrawalRequestId: request.id },
    });
    await supabase
      .from('fintech_withdrawal_requests')
      .update({ refund_ledger_entry_id: refundRow.entry_id })
      .eq('id', requestId);
  }

  const { data: client } = await supabase
    .from('fintech_clients')
    .select('email, full_name, phone_normalized')
    .eq('id', request.client_id)
    .maybeSingle();
  if (client?.email) {
    sendFintechWithdrawalEmailIfConfigured({
      toEmail: client.email,
      fullName: client.full_name,
      decision,
      rubAmount: Number(request.rub_amount),
      rejectReason: patch.reject_reason,
    }).catch((e) => console.warn('[fintech withdrawal email]', e?.message || e));
  }

  if (decision === 'rejected' || decision === 'paid') {
    const phone = client?.phone_normalized
      ? (String(client.phone_normalized).startsWith('7')
        ? `+${client.phone_normalized}`
        : client.phone_normalized)
      : '—';
    const head = decision === 'paid'
      ? '✅ Вывод отмечен оплаченным'
      : '❌ Вывод отклонён, сумма на балансе клиента';
    await notifyWithdrawalTelegram([
      head,
      `Клиент: ${client?.full_name || 'без имени'} · ${phone}`,
      `Сумма: ${formatMoneyRub(request.rub_amount)}`,
      decision === 'rejected' && patch.reject_reason ? `Причина: ${patch.reject_reason}` : null,
      `ID: ${request.id}`,
    ].filter(Boolean).join('\n')).catch((e) => console.warn('[fintech withdraw decide tg]', e?.message || e));
  }

  return { ok: true, status: decision };
}
