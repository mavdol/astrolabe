// kvlite: an in-memory key-value store with optional expiry.
export function open() {
  const entries = new Map();

  return {
    set(key, value, ttlSeconds) {
      entries.set(key, { value: JSON.stringify(value), expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity });
    },
    get(key) {
      const entry = entries.get(key);

      if (!entry || entry.expires < Date.now()) return undefined;

      return JSON.parse(entry.value);
    },
  };
}
