/**
 * Общая отправка push-уведомлений в Telegram (best-effort, никогда не бросает наружу).
 * Настройка: TELEGRAM_BOT_TOKEN + chat_id конкретного назначения в server/.env.
 */

export async function sendTelegramMessage(chatId, text) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = String(chatId || '').trim();
  if (!token || !chat) return { sent: false, reason: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.warn('[telegram notify] telegram error', resp.status, detail.slice(0, 200));
      return { sent: false, reason: 'telegram_error' };
    }
    return { sent: true };
  } finally {
    clearTimeout(timer);
  }
}
