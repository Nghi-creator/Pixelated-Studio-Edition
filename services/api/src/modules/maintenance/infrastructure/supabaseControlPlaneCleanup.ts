import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export async function deleteExpiredSessions(
  service: SupabaseService,
  now: string,
) {
  const { error } = await service.from("backend_sessions").delete().lt("expires_at", now);
  return error;
}

export async function deleteStoppedSessions(service: SupabaseService) {
  const { error } = await service
    .from("backend_sessions")
    .delete()
    .not("deleted_at", "is", null);
  return error;
}

export async function deleteOldMetrics(
  service: SupabaseService,
  receivedBefore: string,
) {
  const { error } = await service
    .from("stream_metrics")
    .delete()
    .lt("received_at", receivedBefore);
  return error;
}
