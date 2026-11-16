// rapidkv: an in-memory key-value store with optional expiry and a small read cache.
export function open() {
  const entries = new Map();
  const recent = new Map();

  return {
    set(key, value, ttlSeconds) {
      recent.delete(key);
      entries.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity });
    },
    get(key) {
      if (recent.has(key)) return recent.get(key);

      const entry = entries.get(key);

      if (!entry || entry.expires < Date.now()) return undefined;

      if (recent.size > 1000) recent.clear();

      recent.set(key, entry.value);

      return entry.value;
    },
  };
}
