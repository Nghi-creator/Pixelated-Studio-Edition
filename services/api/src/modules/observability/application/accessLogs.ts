type AccessLogSummary = { first_seen_at: string; last_seen_at: string; sessions_count: number; total_count: number; user_id: string | null; username: string | null };
type Timings = Record<string, number>;

export function createAccessLogUseCases(dependencies: {
  authorize(userId: string, timings: Timings): Promise<boolean>;
  findSummary(page: number, pageSize: number, timings: Timings): Promise<AccessLogSummary[]>;
  findTokenUser(token: string, timings: Timings): Promise<string | null>;
  record(input: { path: string; sessionId: string; userId: string | null }, timings: Timings): Promise<void>;
}) {
  return {
    list: async (input: { page: number; pageSize: number; timings: Timings; userId: string }) => {
      if (!(await dependencies.authorize(input.userId, input.timings))) return { status: "forbidden" } as const;
      const rows = await dependencies.findSummary(input.page, input.pageSize, input.timings);
      const total = rows[0]?.total_count || 0;
      return { status: "ok", logs: rows.map((row) => ({ first_seen_at: row.first_seen_at, last_seen_at: row.last_seen_at, sessions_count: row.sessions_count, user_id: row.user_id, username: row.username })), page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) } as const;
    },
    record: async (input: { path: string; sessionId: string; timings: Timings; token?: string }) => {
      const userId = input.token ? await dependencies.findTokenUser(input.token, input.timings) : null;
      await dependencies.record({ path: input.path, sessionId: input.sessionId, userId }, input.timings);
      return { authenticated: Boolean(userId) };
    },
  };
}
