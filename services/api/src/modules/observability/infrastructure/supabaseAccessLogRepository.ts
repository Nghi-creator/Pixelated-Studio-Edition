import type {
  supabaseAnon,
  SupabaseService,
} from "../../auth/infrastructure/supabaseClients.js";

export type AccessLogRow = {
  first_seen_at: string;
  last_seen_at: string;
  sessions_count: number;
  total_count: number;
  user_id: string | null;
  username: string | null;
};

export async function findTokenUserId(
  anon: NonNullable<typeof supabaseAnon>,
  token: string,
) {
  const { data, error } = await anon.auth.getUser(token);
  return error ? null : data.user?.id || null;
}

export async function recordAccessLog(
  service: SupabaseService,
  input: { path: string; sessionId: string; userId: string | null },
) {
  const { error } = await service.rpc("record_access_log", {
    p_path: input.path,
    p_session_id: input.sessionId,
    p_user_id: input.userId,
  });
  if (error) throw error;
}

export async function findAccessLogSummary(
  service: SupabaseService,
  page: number,
  pageSize: number,
) {
  const { data, error } = await service.rpc("admin_access_log_summary", {
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  return (data || []) as AccessLogRow[];
}
