type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export type FixedWindowRateLimiterOptions = {
  limit: number;
  maxEntries?: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();
  private consumeCount = 0;

  constructor(private readonly options: FixedWindowRateLimiterOptions) {}

  consume(key: string, now = Date.now()): RateLimitResult {
    this.consumeCount += 1;
    if (this.consumeCount % 256 === 0) {
      this.removeExpired(now);
    }

    const existing = this.records.get(key);
    if (!existing || existing.resetAt <= now) {
      this.makeRoom(now);
      const resetAt = now + this.options.windowMs;
      this.records.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.options.limit - 1, resetAt };
    }

    if (existing.count >= this.options.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.options.limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  private makeRoom(now: number) {
    const maxEntries = this.options.maxEntries || 10_000;
    if (this.records.size < maxEntries) return;

    this.removeExpired(now);
    while (this.records.size >= maxEntries) {
      const oldestKey = this.records.keys().next().value;
      if (typeof oldestKey !== "string") return;
      this.records.delete(oldestKey);
    }
  }

  private removeExpired(now: number) {
    for (const [key, record] of this.records) {
      if (record.resetAt <= now) this.records.delete(key);
    }
  }
}
