/**
 * Tiny localStorage cache so the last good API response renders instantly on
 * reload and survives a transient API/network blip.
 */
export function cacheSet<T>(key: string, val: T): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify({ at: Date.now(), val }));
  } catch {
    /* storage full / disabled — ignore */
  }
}

export function cacheGet<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw).val as T) ?? null) : null;
  } catch {
    return null;
  }
}

/** fetch that aborts after `ms` so a slow API falls back quickly. */
export async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
