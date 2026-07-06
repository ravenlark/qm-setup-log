type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const current = cache.get(key) as CacheEntry<T> | undefined;

  if (current && current.expiresAt > now) {
    return current.promise;
  }

  const promise = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}

export function invalidateCache(keyPrefix: string) {
  for (const key of cache.keys()) {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      cache.delete(key);
    }
  }
}
