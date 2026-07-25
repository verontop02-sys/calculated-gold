/**
 * Финансовое ядро fintech-кабинета: покупка золота, ручное пополнение,
 * портфель клиента, история операций.
 *
 * Всё пишется через Postgres RPC fintech_record_ledger_entry (см. миграцию
 * 20260722130000_fintech_core.sql) — вставка в ledger и обновление баланса
 * происходят в одной транзакции БД. Node здесь не хранит состояние.
 *
 * Курс — берём тот же кэш котировки, что и калькулятор скупки (app_kv:'gold_price'),
 * но fintech-комиссия отдельная (app_kv:'fintech_settings') — это другая бизнес-линия.
 */
import crypto from 'crypto';

const DEFAULT_SETTINGS = {
  buyFeePercent: 1.5,
  sellFeePercent: 1.5,
  minPurchaseGrams: 1,
  minSellGrams: 1,
};

async function getKv(supabase, key) {
  const { data, error } = await supabase.from('app_kv').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function getFintechSettings(supabase) {
  const value = await getKv(supabase, 'fintech_settings');
  return { ...DEFAULT_SETTINGS, ...(value || {}) };
}

export async function setFintechSettings(supabase, patch) {
  const current = await getFintechSettings(supabase);
  const next = { ...current, ...(patch || {}) };
  const { error } = await supabase.from('app_kv').upsert({ key: 'fintech_settings', value: next }, { onConflict: 'key' });
  if (error) throw error;
  return next;
}

/** Живой курс — тот же кэш, что у калькулятора скупки (обновляется фоновым тиком в index.js). */
export async function getLiveGoldRatePerGram(supabase) {
  const cache = await getKv(supabase, 'gold_price');
  const rate = Number(cache?.goldRubPerGram);
  if (!Number.isFinite(rate) || rate <= 0) {
    const err = new Error('Курс золота временно недоступен, попробуйте позже');
    err.status = 503;
    throw err;
  }
  return { rate, cachedAt: cache?.cachedAt || null, source: cache?.source || 'unknown' };
}

async function requireApprovedClient(supabase, clientId) {
  const { data: client, error } = await supabase
    .from('fintech_clients')
    .select('id, status')
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

/**
 * Покупка золота с внутреннего рублёвого баланса клиента.
 * Указывается ровно одно из: rubAmount (сумма в ₽) или grams (граммы) — второе считается сервером.
 * Комиссия закладывается в курс покупки (клиент платит больше, чем "чистая" стоимость граммов).
 */
export async function buyGold(supabase, { clientId, rubAmount, grams, idempotencyKey }) {
  await requireApprovedClient(supabase, clientId);
  const settings = await getFintechSettings(supabase);
  const { rate } = await getLiveGoldRatePerGram(supabase);
  const feeMult = 1 + Number(settings.buyFeePercent || 0) / 100;
  const effectiveRatePerGram = rate * feeMult;

  let gramsBought;
  let rubToSpend;
  if (rubAmount != null) {
    rubToSpend = Math.round(Number(rubAmount) * 100) / 100;
    if (!Number.isFinite(rubToSpend) || rubToSpend <= 0) {
      const err = new Error('Укажите сумму покупки в рублях');
      err.status = 400;
      throw err;
    }
    gramsBought = rubToSpend / effectiveRatePerGram;
  } else if (grams != null) {
    gramsBought = Number(grams);
    if (!Number.isFinite(gramsBought) || gramsBought <= 0) {
      const err = new Error('Укажите вес покупки в граммах');
      err.status = 400;
      throw err;
    }
    rubToSpend = Math.round(gramsBought * effectiveRatePerGram * 100) / 100;
  } else {
    const err = new Error('Укажите сумму в рублях или вес в граммах');
    err.status = 400;
    throw err;
  }

  if (gramsBought < Number(settings.minPurchaseGrams || 1)) {
    const err = new Error(`Минимальная покупка — ${settings.minPurchaseGrams || 1} г`);
    err.status = 400;
    throw err;
  }

  gramsBought = Math.round(gramsBought * 1e6) / 1e6;
  const feeRub = Math.round((rubToSpend - gramsBought * rate) * 100) / 100;
  const key = idempotencyKey ? `buy:${clientId}:${idempotencyKey}` : `buy:${clientId}:${crypto.randomUUID()}`;

  const { data, error } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: clientId,
    p_entry_type: 'buy_gold',
    p_rub_delta: -rubToSpend,
    p_gold_grams_delta: gramsBought,
    p_rate_rub_per_gram: rate,
    p_fee_rub: feeRub,
    p_idempotency_key: key,
    p_created_by_type: 'client',
    p_created_by_id: clientId,
    p_detail: { effectiveRatePerGram, feePercent: settings.buyFeePercent },
    p_reversal_of: null,
  });
  if (error) {
    if (/insufficient_balance/i.test(error.message || '')) {
      const err = new Error('Недостаточно средств на балансе. Пополните счёт.');
      err.status = 400;
      throw err;
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    gramsBought,
    rubSpent: rubToSpend,
    feeRub,
    ratePerGram: rate,
    rubBalance: Number(row.rub_balance),
    goldGrams: Number(row.gold_grams),
    duplicate: Boolean(row.is_duplicate),
  };
}

/**
 * Продажа виртуального золота обратно на рублёвый баланс клиента.
 * Курс фиксируется на момент сделки; комиссия вычитается из выручки.
 * Вывод на карту/СБП — отдельный шаг (пока stub в UI, без A7/ПСБ).
 */
export async function sellGold(supabase, { clientId, grams, rubAmount, idempotencyKey }) {
  await requireApprovedClient(supabase, clientId);
  const settings = await getFintechSettings(supabase);
  const { rate } = await getLiveGoldRatePerGram(supabase);
  const feeMult = 1 - Number(settings.sellFeePercent || 0) / 100;
  const effectiveRatePerGram = rate * feeMult;

  let gramsSold;
  let rubToCredit;
  if (grams != null) {
    gramsSold = Number(grams);
    if (!Number.isFinite(gramsSold) || gramsSold <= 0) {
      const err = new Error('Укажите вес продажи в граммах');
      err.status = 400;
      throw err;
    }
    rubToCredit = Math.round(gramsSold * effectiveRatePerGram * 100) / 100;
  } else if (rubAmount != null) {
    rubToCredit = Math.round(Number(rubAmount) * 100) / 100;
    if (!Number.isFinite(rubToCredit) || rubToCredit <= 0) {
      const err = new Error('Укажите сумму продажи в рублях');
      err.status = 400;
      throw err;
    }
    gramsSold = rubToCredit / effectiveRatePerGram;
  } else {
    const err = new Error('Укажите сумму в рублях или вес в граммах');
    err.status = 400;
    throw err;
  }

  if (gramsSold < Number(settings.minSellGrams || 1)) {
    const err = new Error(`Минимальная продажа — ${settings.minSellGrams || 1} г`);
    err.status = 400;
    throw err;
  }

  gramsSold = Math.round(gramsSold * 1e6) / 1e6;
  const grossRub = Math.round(gramsSold * rate * 100) / 100;
  const feeRub = Math.round((grossRub - rubToCredit) * 100) / 100;
  const key = idempotencyKey ? `sell:${clientId}:${idempotencyKey}` : `sell:${clientId}:${crypto.randomUUID()}`;

  const { data, error } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: clientId,
    p_entry_type: 'sell_gold',
    p_rub_delta: rubToCredit,
    p_gold_grams_delta: -gramsSold,
    p_rate_rub_per_gram: rate,
    p_fee_rub: feeRub,
    p_idempotency_key: key,
    p_created_by_type: 'client',
    p_created_by_id: clientId,
    p_detail: { effectiveRatePerGram, feePercent: settings.sellFeePercent, grossRub },
    p_reversal_of: null,
  });
  if (error) {
    if (/insufficient_balance/i.test(error.message || '')) {
      const err = new Error('Недостаточно золота на счёте для продажи');
      err.status = 400;
      throw err;
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    gramsSold,
    rubReceived: rubToCredit,
    feeRub,
    ratePerGram: rate,
    rubBalance: Number(row.rub_balance),
    goldGrams: Number(row.gold_grams),
    duplicate: Boolean(row.is_duplicate),
  };
}

/**
 * Ручное пополнение рублёвого баланса модератором — единственный способ завести деньги
 * на счёт клиента, пока нет реального эквайринга. Клиент переводит по реквизитам,
 * модератор подтверждает поступление с обязательным комментарием (номер платежа/выписка).
 */
export async function manualTopup(supabase, { clientId, rubAmount, staffId, comment, idempotencyKey }) {
  const amount = Math.round(Number(rubAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Укажите сумму пополнения');
    err.status = 400;
    throw err;
  }
  const detailComment = String(comment || '').trim();
  if (!detailComment) {
    const err = new Error('Укажите комментарий (номер платежа/основание) — это попадёт в журнал');
    err.status = 400;
    throw err;
  }

  const key = idempotencyKey ? `topup:${clientId}:${idempotencyKey}` : `topup:${clientId}:${crypto.randomUUID()}`;
  const { data, error } = await supabase.rpc('fintech_record_ledger_entry', {
    p_client_id: clientId,
    p_entry_type: 'deposit_rub',
    p_rub_delta: amount,
    p_gold_grams_delta: 0,
    p_rate_rub_per_gram: null,
    p_fee_rub: 0,
    p_idempotency_key: key,
    p_created_by_type: 'staff',
    p_created_by_id: staffId,
    p_detail: { comment: detailComment },
    p_reversal_of: null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    rubBalance: Number(row.rub_balance),
    goldGrams: Number(row.gold_grams),
    duplicate: Boolean(row.is_duplicate),
  };
}

async function getBalance(supabase, clientId) {
  const { data, error } = await supabase
    .from('fintech_balances')
    .select('rub_balance, gold_grams, updated_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return {
    rubBalance: Number(data?.rub_balance || 0),
    goldGrams: Number(data?.gold_grams || 0),
    updatedAt: data?.updated_at || null,
  };
}

/** Портфель клиента: баланс, текущая стоимость по рынку, вложено, доход. */
export async function getClientPortfolio(supabase, clientId) {
  const balance = await getBalance(supabase, clientId);
  const { rate: currentRate, cachedAt } = await getLiveGoldRatePerGram(supabase).catch(() => ({ rate: null, cachedAt: null }));
  const settings = await getFintechSettings(supabase).catch(() => null);

  const { data: buys, error } = await supabase
    .from('fintech_ledger_entries')
    .select('rub_delta, gold_grams_delta, entry_type')
    .eq('client_id', clientId)
    .eq('entry_type', 'buy_gold');
  if (error) throw error;

  const investedRub = (buys || []).reduce((s, r) => s + Math.abs(Number(r.rub_delta) || 0), 0);
  const gramsBoughtTotal = (buys || []).reduce((s, r) => s + (Number(r.gold_grams_delta) || 0), 0);
  const marketValueRub = currentRate ? Math.round(balance.goldGrams * currentRate * 100) / 100 : null;
  const pnlRub = marketValueRub != null ? Math.round((marketValueRub - investedRub) * 100) / 100 : null;
  const pnlPercent = marketValueRub != null && investedRub > 0
    ? Math.round((pnlRub / investedRub) * 10000) / 100
    : null;

  return {
    rubBalance: balance.rubBalance,
    goldGrams: balance.goldGrams,
    marketValueRub,
    investedRub: Math.round(investedRub * 100) / 100,
    gramsBoughtTotal: Math.round(gramsBoughtTotal * 1e6) / 1e6,
    pnlRub,
    pnlPercent,
    currentRatePerGram: currentRate,
    rateUpdatedAt: cachedAt,
    balanceUpdatedAt: balance.updatedAt,
    // Комиссия при покупке/продаже — клиент видит её до подтверждения.
    buyFeePercent: settings ? Number(settings.buyFeePercent || 0) : null,
    sellFeePercent: settings ? Number(settings.sellFeePercent || 0) : null,
    minPurchaseGrams: settings ? Number(settings.minPurchaseGrams || 1) : 1,
    minSellGrams: settings ? Number(settings.minSellGrams || 1) : 1,
  };
}

/** История операций клиента (для дашборда и выписки). */
export async function getClientLedger(supabase, clientId, { limit = 100, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('fintech_ledger_entries')
    .select('id, entry_type, rub_delta, gold_grams_delta, rate_rub_per_gram, fee_rub, detail, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    entryType: r.entry_type,
    rubDelta: Number(r.rub_delta),
    goldGramsDelta: Number(r.gold_grams_delta),
    ratePerGram: r.rate_rub_per_gram != null ? Number(r.rate_rub_per_gram) : null,
    feeRub: Number(r.fee_rub) || 0,
    detail: r.detail || {},
    createdAt: r.created_at,
  }));
}
