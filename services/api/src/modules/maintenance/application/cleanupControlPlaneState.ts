const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runControlPlaneCleanup(input: {
  deleteExpiredSessions(now: string): Promise<unknown>;
  deleteOldMetrics(cutoff: string): Promise<unknown>;
  deleteStoppedSessions(): Promise<unknown>;
  metricRetentionDays: number;
  now: Date;
}) {
  const now = input.now.toISOString();
  const metricCutoff = new Date(
    input.now.getTime() - input.metricRetentionDays * MS_PER_DAY,
  ).toISOString();
  const [expiredSessionError, deletedSessionError, metricError] =
    await Promise.all([
      input.deleteExpiredSessions(now),
      input.deleteStoppedSessions(),
      input.deleteOldMetrics(metricCutoff),
    ]);
  return { deletedSessionError, expiredSessionError, metricError };
}
