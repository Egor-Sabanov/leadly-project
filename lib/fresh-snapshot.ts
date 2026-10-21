/** Keep a short snapshot, but await a fresh result after expiry. */
export function freshSnapshot<T>(load: () => Promise<T>, ttlMs = 30_000, now = Date.now) {
  let cached: { value: T; at: number; until: number } | null = null;
  let pending: Promise<T> | null = null;
  return async (): Promise<T> => {
    const time = now();
    if (cached && time >= cached.at && time < cached.until) return cached.value;
    if (!pending) pending = Promise.resolve().then(load).then(value => {
      const at = now(); cached = { value, at, until: at + ttlMs }; return value;
    }).finally(() => { pending = null; });
    return pending;
  };
}
