type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 10_000,
  ) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Cache TTL must be a positive finite number");
    }
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("Cache max entries must be a positive integer");
    }
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  set(key: string, value: T) {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      this.removeExpired();
      while (this.entries.size >= this.maxEntries) {
        const oldestKey = this.entries.keys().next().value;
        if (typeof oldestKey !== "string") break;
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      value,
    });
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  private removeExpired(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
