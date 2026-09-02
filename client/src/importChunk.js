/**
 * Динамический import() после нового деплоя: старая вкладка просит hashed-чанк,
 * которого уже нет. Firebase отдаёт index.html (text/html) — Safari пишет
 * «'text/html' is not a valid JavaScript MIME type». Один reload подхватывает
 * свежий index.html с актуальными именами чанков.
 */
const RELOAD_KEY = 'cg-stale-chunk-reload';

export function isStaleChunkError(err) {
  const msg = String(err?.message || err || '');
  return /MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg);
}

export async function importChunk(loader) {
  try {
    const mod = await loader();
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    return mod;
  } catch (err) {
    if (isStaleChunkError(err) && typeof sessionStorage !== 'undefined' && typeof window !== 'undefined') {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
          return new Promise(() => {});
        }
      } catch { /* ignore */ }
    }
    const stale = isStaleChunkError(err);
    const wrapped = new Error(stale
      ? 'Страница устарела после обновления. Обновите её (Ctrl+F5) и скачайте PDF снова.'
      : (err?.message || 'Не удалось загрузить модуль отчёта'));
    wrapped.cause = err;
    throw wrapped;
  }
}
