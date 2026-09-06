/**
 * Общая отправка push-уведомлений в Telegram (best-effort, никогда не бросает наружу).
 * Настройка: TELEGRAM_BOT_TOKEN + chat_id конкретного назначения в server/.env.
 *
 * Если группу апгрейдили до супергруппы, Telegram отвечает 400 + migrate_to_chat_id —
 * один раз повторяем на новый id и логируем, чтобы обновить env.
 */

export async function sendTelegramMessage(chatId, text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = String(chatId || '').trim();
  if (!token || !chat) {
    console.warn('[telegram notify] skip: TELEGRAM_BOT_TOKEN or chat_id not set');
    return { sent: false, reason: 'not_configured' };
  }

  const first = await postSendMessage(token, chat, text);
  if (first.ok) return { sent: true };

  const migrated = first.migrateTo;
  if (migrated) {
    console.warn(
      `[telegram notify] chat migrated ${chat} → ${migrated}. Обновите TELEGRAM_SUPPORT_CHAT_ID на Render.`
    );
    const second = await postSendMessage(token, String(migrated), text);
    if (second.ok) return { sent: true, migratedTo: String(migrated) };
    return { sent: false, reason: 'telegram_error', detail: second.detail };
  }

  console.warn('[telegram notify] telegram error', first.status, (first.detail || '').slice(0, 200));
  return { sent: false, reason: 'telegram_error', detail: first.detail };
}

/**
 * Отправка фото в Telegram по URL (Telegram сам скачивает файл по ссылке — не
 * шлём байты). Используем для заявок с приложенным фото изделия: так фото сразу
 * видно в чате превью, а не как текстовая ссылка, которую легко испортить обрезкой.
 * При ошибке (например, Telegram не смог скачать по signed URL) — молча падаем
 * назад на обычное текстовое сообщение с той же ссылкой в конце.
 */
export async function sendTelegramPhoto(chatId, photoUrl, caption) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = String(chatId || '').trim();
  if (!token || !chat) {
    console.warn('[telegram notify] skip photo: TELEGRAM_BOT_TOKEN or chat_id not set');
    return { sent: false, reason: 'not_configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, photo: photoUrl, caption: caption?.slice(0, 1024) || undefined }),
      signal: controller.signal,
    });
    if (resp.ok) return { sent: true };
    const detail = await resp.text().catch(() => '');
    console.warn('[telegram notify] sendPhoto error', resp.status, detail.slice(0, 200));
    return { sent: false, reason: 'telegram_error', detail };
  } catch (e) {
    console.warn('[telegram notify] sendPhoto error', e?.message || e);
    return { sent: false, reason: 'error', detail: e?.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function postSendMessage(token, chatId, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    if (resp.ok) return { ok: true };
    const detail = await resp.text().catch(() => '');
    let migrateTo = null;
    try {
      const j = JSON.parse(detail);
      migrateTo = j?.parameters?.migrate_to_chat_id ?? null;
    } catch {
      /* ignore */
    }
    return { ok: false, status: resp.status, detail, migrateTo };
  } catch (e) {
    return { ok: false, status: 0, detail: e?.message || String(e), migrateTo: null };
  } finally {
    clearTimeout(timer);
  }
}
