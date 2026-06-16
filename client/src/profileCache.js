const KEY = 'cg_profile_cache_v1';

export function readProfileCache(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.uid !== uid) return null;
    if (!data.role) return null;
    return { uid: data.uid, email: data.email || '', role: data.role };
  } catch {
    return null;
  }
}

export function writeProfileCache(user) {
  if (!user?.uid || !user?.role) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        uid: user.uid,
        email: user.email || '',
        role: user.role,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function clearProfileCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
