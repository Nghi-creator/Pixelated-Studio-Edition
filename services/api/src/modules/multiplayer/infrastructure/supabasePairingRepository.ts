import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

type LocalPairingRow = {
  created_at: string;
  engine_url: string;
  id: string;
  token_stored_by: "browser-local-storage";
  updated_at: string;
};

const PAIRING_COLUMNS = "id,engine_url,token_stored_by,created_at,updated_at";

function mapPairing(row: LocalPairingRow) {
  return {
    createdAt: row.created_at,
    engineUrl: row.engine_url,
    pairingId: row.id,
    tokenStoredBy: row.token_stored_by,
    updatedAt: row.updated_at,
  };
}

export async function findCurrentPairing(
  service: SupabaseService,
  userId: string,
) {
  const { data, error } = await service
    .from("local_engine_pairings")
    .select(PAIRING_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<LocalPairingRow>();
  if (error) throw error;
  return data ? mapPairing(data) : null;
}

export async function savePairing(
  service: SupabaseService,
  userId: string,
  engineUrl: string,
) {
  const { data, error } = await service
    .from("local_engine_pairings")
    .upsert(
      {
        engine_url: engineUrl,
        token_stored_by: "browser-local-storage",
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: "user_id" },
    )
    .select(PAIRING_COLUMNS)
    .single<LocalPairingRow>();
  if (error || !data) throw error || new Error("Supabase returned no pairing");
  return mapPairing(data);
}

export async function clearPairing(service: SupabaseService, userId: string) {
  const { error } = await service
    .from("local_engine_pairings")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
