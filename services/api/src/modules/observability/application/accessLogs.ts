type AccessLogSummary = { first_seen_at: string; last_seen_at: string; sessions_count: number; total_count: number; user_id: string | null; username: string | null };

export function createAccessLogUseCases(dependencies: {
  authorize(userId: string): Promise<boolean>;
  findSummary(page: number, pageSize: number): Promise<AccessLogSummary[]>;
  findTokenUser(token: string): Promise<string | null>;
  record(input: { path: string; sessionId: string; userId: string | null }): Promise<void>;
}) {
  return {
    list: async (input: { page: number; pageSize: number; userId: string }) => {
      if (!(await dependencies.authorize(input.userId))) return { status: "forbidden" } as const;
      const rows = await dependencies.findSummary(input.page, input.pageSize);
      const total = rows[0]?.total_count || 0;
      return { status: "ok", logs: rows.map((row) => ({ first_seen_at: row.first_seen_at, last_seen_at: row.last_seen_at, sessions_count: row.sessions_count, user_id: row.user_id, username: row.username })), page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) } as const;
    },
    record: async (input: { path: string; sessionId: string; token?: string }) => {
      const userId = input.token ? await dependencies.findTokenUser(input.token) : null;
      await dependencies.record({ path: input.path, sessionId: input.sessionId, userId });
      return { authenticated: Boolean(userId) };
    },
  };
}
