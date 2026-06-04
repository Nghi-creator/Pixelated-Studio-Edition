type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

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
}
