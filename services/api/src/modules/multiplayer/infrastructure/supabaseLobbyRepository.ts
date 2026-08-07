import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

type MultiplayerLobbyRow = {
  created_at: string;
  engine_url: string | null;
  exposure_mode: "lan" | "local" | "unknown";
  game_id: string;
  host_user_id: string;
  id: string;
  max_players: number;
  participants: unknown;
  session_id: string;
  status: "active" | "ended";
  updated_at: string;
};

const LOBBY_COLUMNS =
  "id,host_user_id,session_id,game_id,engine_url,exposure_mode,status,max_players,participants,created_at,updated_at";

function mapLobby(row: MultiplayerLobbyRow) {
  return {
    createdAt: row.created_at,
    engineUrl: row.engine_url,
    exposureMode: row.exposure_mode,
    gameId: row.game_id,
    hostUserId: row.host_user_id,
    lobbyId: row.id,
    maxPlayers: row.max_players,
    participants: row.participants,
    sessionId: row.session_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function saveLobby(
  service: SupabaseService,
  input: {
    engineUrl: string | null;
    exposureMode: "lan" | "local" | "unknown";
    gameId: string;
    hostUserId: string;
    maxPlayers: number;
    participants: unknown[];
    sessionId: string;
  },
) {
  const { data, error } = await service
    .from("multiplayer_lobbies")
    .upsert(
      {
        engine_url: input.engineUrl,
        exposure_mode: input.exposureMode,
        game_id: input.gameId,
        host_user_id: input.hostUserId,
        max_players: input.maxPlayers,
        participants: input.participants,
        session_id: input.sessionId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "host_user_id,session_id" },
    )
    .select(LOBBY_COLUMNS)
    .single<MultiplayerLobbyRow>();
  if (error || !data) throw error || new Error("Supabase returned no lobby");
  return mapLobby(data);
}

export async function findRecentLobbies(
  service: SupabaseService,
  hostUserId: string,
) {
  const { data, error } = await service
    .from("multiplayer_lobbies")
    .select(LOBBY_COLUMNS)
    .eq("host_user_id", hostUserId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(10)
    .returns<MultiplayerLobbyRow[]>();
  if (error) throw error;
  return (data || []).map(mapLobby);
}

export async function endLobby(
  service: SupabaseService,
  hostUserId: string,
  sessionId: string,
) {
  const { error } = await service
    .from("multiplayer_lobbies")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("host_user_id", hostUserId)
    .eq("session_id", sessionId);
  if (error) throw error;
}
