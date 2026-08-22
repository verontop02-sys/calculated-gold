import { createClient } from '@supabase/supabase-js';

function resolveSupabaseUrl() {
  const raw = String(import.meta.env.VITE_SUPABASE_URL || '/sb').trim();
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://reaktivo.pro';
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${origin}${path}`.replace(/\/$/, '');
}

const url = resolveSupabaseUrl();
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    '[Calculated Gold] Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (Supabase → Settings → API).'
  );
}

export const supabase = createClient(url || '', anon || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Если в localStorage лежит протухший или отозванный refresh-токен,
 * клиент получает 400 на /token. Очищаем локальную сессию, чтобы можно было войти снова.
 */
export async function recoverAuthIfNeeded() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  // Токен ещё жив — не дергаем Supabase по сети при каждом открытии вкладки.
  const expiresMs = (session.expires_at ?? 0) * 1000;
  if (expiresMs > Date.now() + 120_000) return;
  const { error } = await supabase.auth.getUser();
  if (!error) return;
  const m = String(error.message || '');
  const st = error.status ?? error.statusCode;
  if (
    m.includes('Invalid Refresh Token') ||
    m.includes('Refresh Token Not Found') ||
    (st === 400 && /refresh|token/i.test(m))
  ) {
    await supabase.auth.signOut({ scope: 'local' });
  }
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && !session) {
      void supabase.auth.signOut({ scope: 'local' });
    }
  });
}
