import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

type GameActivityRow = {
  client_edition: "studio" | "user";
  game_id: string;
  last_played_at: string;
  play_count: number;
  runtime_kind: "wasm" | "webrtc" | "native";
};

type ActivityGameRow = {
  cover_url: string | null;
  id: string;
  title: string;
};

export async function findProfile(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("username, avatar_url, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findProfileActivity(
  service: SupabaseService,
  userId: string,
  limit: number,
) {
  const { data: activityRows, error: activityError } = await service
    .from("user_game_activity")
    .select("game_id,client_edition,runtime_kind,play_count,last_played_at")
    .eq("user_id", userId)
    .order("last_played_at", { ascending: false })
    .limit(limit)
    .returns<GameActivityRow[]>();
  if (activityError) throw activityError;

  const rows = activityRows || [];
  if (rows.length === 0) return [];

  const { data: games, error: gamesError } = await service
    .from("games")
    .select("id,title,cover_url")
    .in("id", [...new Set(rows.map((row) => row.game_id))])
    .returns<ActivityGameRow[]>();
  if (gamesError) throw gamesError;

  const gamesById = new Map((games || []).map((game) => [game.id, game]));
  return rows.flatMap((row) => {
    const game = gamesById.get(row.game_id);
    return game ? [{ ...row, game }] : [];
  });
}

export async function updateProfile(
  service: SupabaseService,
  userId: string,
  input: { avatarUrl?: string | null; username: string },
) {
  const { error } = await service
    .from("profiles")
    .update({
      ...(input.avatarUrl !== undefined ? { avatar_url: input.avatarUrl } : {}),
      username: input.username,
    })
    .eq("id", userId);
  if (error) throw error;
}

export async function findAccountRole(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();
  if (error) throw error;
  return data?.role || null;
}
