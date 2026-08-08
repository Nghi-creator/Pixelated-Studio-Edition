import { supabaseService } from "./supabaseClients.js";
import type { BackendSessionRow } from "../domain/backendSession.js";

export type { BackendSessionRow } from "../domain/backendSession.js";

export type SupabaseServiceLike = NonNullable<typeof supabaseService>;

export async function getLiveSession(
  service: SupabaseServiceLike,
  sessionId: string,
) {
  const { data, error } = await service
    .from("backend_sessions")
    .select(
      "id,user_id,game_id,mode,session_token_hash,boot_rom_url,boot_rom_filename,boot_runtime_id,boot_artifact_size,boot_artifact_sha256,boot_launch_manifest_id,client_edition,client_runtime_kind,browser_core_id,browser_system_id,expires_at,deleted_at",
    )
    .eq("id", sessionId)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<BackendSessionRow>();

  if (error || !data) return null;

  return data;
}

export async function stopSession(
  service: SupabaseServiceLike,
  sessionId: string,
) {
  const { error } = await service
    .from("backend_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function insertSession(
  service: SupabaseServiceLike,
  row: Record<string, unknown>,
) {
  const { error } = await service.from("backend_sessions").insert(row);
  if (error) throw error;
}
