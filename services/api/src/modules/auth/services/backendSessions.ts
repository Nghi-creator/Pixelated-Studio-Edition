import { supabaseService } from "../supabaseAuth.js";

export type SupabaseServiceLike = NonNullable<typeof supabaseService>;

export type BackendSessionRow = {
  boot_artifact_sha256: string | null;
  boot_artifact_size: number | null;
  boot_launch_manifest_id: string | null;
  boot_rom_filename: string | null;
  boot_rom_url: string | null;
  boot_runtime_id: string;
  deleted_at: string | null;
  expires_at: string;
  game_id: string;
  id: string;
  mode: "cloud" | "local";
  session_token_hash: string;
  user_id: string | null;
};

export async function getLiveSession(
  service: SupabaseServiceLike,
  sessionId: string,
) {
  const { data, error } = await service
    .from("backend_sessions")
    .select(
      "id,user_id,game_id,mode,session_token_hash,boot_rom_url,boot_rom_filename,boot_runtime_id,boot_artifact_size,boot_artifact_sha256,boot_launch_manifest_id,expires_at,deleted_at",
    )
    .eq("id", sessionId)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<BackendSessionRow>();

  if (error || !data) return null;

  return data;
}
