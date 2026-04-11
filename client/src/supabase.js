import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn(
    '[Calculated Gold] Задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (Supabase → Settings → API).'
  );
}

export const supabase = createClient(url || '', anon || '');
