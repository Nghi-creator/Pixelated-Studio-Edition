const MIN_INTERVAL_MS = 5_000;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60_000;

export type StreamMetricInput = {
  bitrateKbps: number | null; connectionState: string; fps: number | null;
  iceConnectionState: string; jitterMs: number | null; packetsLost: number;
  sessionId: string; timestamp: string;
};

export function createRecordStreamMetric(dependencies: {
  consumeSession(key: string, now: number): Promise<{ allowed: boolean }>;
  consumeUser(key: string, now: number): Promise<{ allowed: boolean }>;
  findLatest(userId: string, sessionId: string): Promise<number>;
  hasLiveSession(sessionId: string, userId: string): Promise<boolean>;
  insert(input: StreamMetricInput & { receivedAt: string; userId: string }): Promise<void>;
  now(): number;
}) {
  return async (metric: StreamMetricInput, userId: string) => {
    const now = dependencies.now();
    if (Math.abs(Date.parse(metric.timestamp) - now) > MAX_CLOCK_SKEW_MS) return { status: "invalid_timestamp" } as const;
    if (!(await dependencies.consumeUser(userId, now)).allowed) return { status: "rate_limited" } as const;
    if (!(await dependencies.hasLiveSession(metric.sessionId, userId))) return { status: "missing_session" } as const;
    if (!(await dependencies.consumeSession(`${userId}:${metric.sessionId}`, now)).allowed) return { status: "rate_limited" } as const;
    if (now - await dependencies.findLatest(userId, metric.sessionId) < MIN_INTERVAL_MS) return { status: "rate_limited" } as const;
    await dependencies.insert({ ...metric, receivedAt: new Date(now).toISOString(), userId });
    return { status: "accepted" } as const;
  };
}
