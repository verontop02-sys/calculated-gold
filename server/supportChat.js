/**
 * Чат поддержки: клиент кабинета (вход по телефону) ↔ сотрудники панели.
 *
 * Тред один на телефон (phone_normalized) — общий для скупки и биржи.
 * Счётчики непрочитанного денормализованы в support_threads:
 *   staff_unread  — сообщения клиента, которые ещё не открыла поддержка;
 *   client_unread — ответы поддержки, которые ещё не видел клиент.
 *
 * Telegram-уведомление о новом сообщении клиента — best-effort:
 * TELEGRAM_BOT_TOKEN + TELEGRAM_SUPPORT_CHAT_ID в server/.env.
 */

const MAX_MESSAGE_LEN = 2000;
const PAGE_MESSAGES = 300;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function sanitizeBody(raw) {
  const body = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) throw badRequest('Введите текст сообщения');
  if (body.length > MAX_MESSAGE_LEN) throw badRequest(`Сообщение слишком длинное (до ${MAX_MESSAGE_LEN} символов)`);
  return body;
}

function preview(body) {
  const one = body.replace(/\s+/g, ' ').trim();
  return one.length > 140 ? `${one.slice(0, 139)}…` : one;
}

function mapMessage(m) {
  return {
    id: m.id,
    sender: m.sender,
    staffName: m.staff_name || null,
    body: m.body,
    createdAt: m.created_at,
  };
}

async function getOrCreateThread(supabase, phoneNormalized) {
  const { data: existing, error } = await supabase
    .from('support_threads')
    .select('*')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from('support_threads')
    .insert({ phone_normalized: phoneNormalized })
    .select('*')
    .single();
  // Гонка двух параллельных запросов: unique(phone_normalized) — перечитываем.
  if (insErr) {
    const { data: retry, error: retryErr } = await supabase
      .from('support_threads')
      .select('*')
      .eq('phone_normalized', phoneNormalized)
      .maybeSingle();
    if (retryErr || !retry) throw insErr;
    return retry;
  }
  return created;
}

async function loadMessages(supabase, threadId) {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, sender, staff_name, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(PAGE_MESSAGES);
  if (error) throw error;
  return (data || []).map(mapMessage);
}

// ── Клиентская сторона ───────────────────────────────────────────────────────

export async function clientGetSupportChat(supabase, phoneNormalized) {
  const thread = await getOrCreateThread(supabase, phoneNormalized);
  const messages = await loadMessages(supabase, thread.id);
  if (thread.client_unread > 0) {
    await supabase
      .from('support_threads')
      .update({ client_unread: 0, updated_at: new Date().toISOString() })
      .eq('id', thread.id);
  }
  return {
    threadId: thread.id,
    status: thread.status,
    messages,
  };
}

/** Бейдж «есть ответ поддержки» — без создания треда и без сброса счётчика. */
export async function clientSupportUnread(supabase, phoneNormalized) {
  const { data, error } = await supabase
    .from('support_threads')
    .select('client_unread')
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (error) throw error;
  return { unread: data?.client_unread || 0 };
}

export async function clientSendSupportMessage(supabase, { phoneNormalized, body: rawBody }) {
  const body = sanitizeBody(rawBody);
  const thread = await getOrCreateThread(supabase, phoneNormalized);

  const { data: msg, error } = await supabase
    .from('support_messages')
    .insert({ thread_id: thread.id, sender: 'client', body })
    .select('id, sender, staff_name, body, created_at')
    .single();
  if (error) throw error;

  const { error: upErr } = await supabase
    .from('support_threads')
    .update({
      status: 'open',
      last_message_at: msg.created_at,
      last_message_preview: preview(body),
      last_message_from: 'client',
      staff_unread: (thread.staff_unread || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', thread.id);
  if (upErr) throw upErr;

  notifySupportTelegram({ phoneNormalized, body }).catch((e) =>
    console.warn('[support tg notify]', e?.message || e)
  );

  return { ok: true, message: mapMessage(msg) };
}

// ── Сторона сотрудников ──────────────────────────────────────────────────────

export async function staffListSupportThreads(supabase, { status } = {}) {
  let query = supabase
    .from('support_threads')
    .select('id, phone_normalized, status, last_message_at, last_message_preview, last_message_from, staff_unread, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (status === 'open' || status === 'closed') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  const threads = data || [];

  // Имена клиентов из fintech-профилей (если заполняли ФИО в KYC).
  const phones = threads.map((t) => t.phone_normalized);
  const names = new Map();
  if (phones.length) {
    const { data: clients } = await supabase
      .from('fintech_clients')
      .select('phone_normalized, full_name')
      .in('phone_normalized', phones);
    for (const c of clients || []) {
      if (c.full_name) names.set(c.phone_normalized, c.full_name);
    }
  }

  return {
    threads: threads.map((t) => ({
      id: t.id,
      phone: t.phone_normalized,
      fullName: names.get(t.phone_normalized) || null,
      status: t.status,
      lastMessageAt: t.last_message_at,
      lastMessagePreview: t.last_message_preview,
      lastMessageFrom: t.last_message_from,
      unread: t.staff_unread || 0,
      createdAt: t.created_at,
    })),
  };
}

export async function staffGetSupportThread(supabase, threadId) {
  const { data: thread, error } = await supabase
    .from('support_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw error;
  if (!thread) {
    const err = new Error('Диалог не найден');
    err.status = 404;
    throw err;
  }
  const messages = await loadMessages(supabase, threadId);
  if (thread.staff_unread > 0) {
    await supabase
      .from('support_threads')
      .update({ staff_unread: 0, updated_at: new Date().toISOString() })
      .eq('id', threadId);
  }
  return {
    id: thread.id,
    phone: thread.phone_normalized,
    status: thread.status,
    messages,
  };
}

export async function staffReplySupport(supabase, { threadId, staffId, staffName, body: rawBody }) {
  const body = sanitizeBody(rawBody);
  const { data: thread, error: thErr } = await supabase
    .from('support_threads')
    .select('id, client_unread')
    .eq('id', threadId)
    .maybeSingle();
  if (thErr) throw thErr;
  if (!thread) {
    const err = new Error('Диалог не найден');
    err.status = 404;
    throw err;
  }

  const { data: msg, error } = await supabase
    .from('support_messages')
    .insert({
      thread_id: threadId,
      sender: 'staff',
      staff_id: staffId || null,
      staff_name: staffName || null,
      body,
    })
    .select('id, sender, staff_name, body, created_at')
    .single();
  if (error) throw error;

  const { error: upErr } = await supabase
    .from('support_threads')
    .update({
      status: 'open',
      last_message_at: msg.created_at,
      last_message_preview: preview(body),
      last_message_from: 'staff',
      client_unread: (thread.client_unread || 0) + 1,
      staff_unread: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
  if (upErr) throw upErr;

  return { ok: true, message: mapMessage(msg) };
}

export async function staffSetSupportThreadStatus(supabase, { threadId, status }) {
  if (status !== 'open' && status !== 'closed') throw badRequest('Некорректный статус диалога');
  const { error } = await supabase
    .from('support_threads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', threadId);
  if (error) throw error;
  return { ok: true, status };
}

/** Суммарный «непрочитанный» счётчик для бейджа в сайдбаре панели. */
export async function staffSupportUnreadTotal(supabase) {
  const { data, error } = await supabase
    .from('support_threads')
    .select('staff_unread')
    .gt('staff_unread', 0)
    .limit(500);
  if (error) throw error;
  const total = (data || []).reduce((s, t) => s + (t.staff_unread || 0), 0);
  return { total };
}

// ── Telegram-уведомление ─────────────────────────────────────────────────────

async function notifySupportTelegram({ phoneNormalized, body }) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_SUPPORT_CHAT_ID || '').trim();
  if (!token || !chatId) return; // не настроено — тихо пропускаем

  const digits = String(phoneNormalized || '').replace(/\D/g, '');
  const phonePretty = digits.length === 11
    ? `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`
    : `+${digits}`;

  const text = [
    '💬 Новое сообщение в поддержку Reaktivo',
    `Клиент: ${phonePretty}`,
    '',
    body.length > 500 ? `${body.slice(0, 499)}…` : body,
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.warn('[support tg notify] telegram error', resp.status, detail.slice(0, 200));
    }
  } finally {
    clearTimeout(timer);
  }
}
