import { performance } from "node:perf_hooks";
import type { FastifyBaseLogger } from "fastify";

export type TimingFields = Record<string, number>;

export async function timed<T>(
  timings: TimingFields,
  key: string,
  action: () => T | PromiseLike<T>,
): Promise<Awaited<T>> {
  const startedAt = performance.now();
  try {
    return await action();
  } finally {
    timings[key] = Math.round(performance.now() - startedAt);
  }
}

export function logTiming(
  logger: FastifyBaseLogger,
  message: string,
  timings: TimingFields,
  extra: Record<string, unknown> = {},
) {
  logger.info({ ...extra, timings }, message);
}
