import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export async function findFavorites(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("favorites")
    .select("game_id,games(id,title,cover_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.games).filter(Boolean);
}

export async function hasFavorite(
  service: SupabaseService,
  userId: string,
  gameId: string,
) {
  const { data, error } = await service
    .from("favorites")
    .select("game_id")
    .eq("user_id", userId)
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function saveFavorite(
  service: SupabaseService,
  userId: string,
  gameId: string,
) {
  const { error } = await service.from("favorites").upsert({ game_id: gameId, user_id: userId });
  if (error) throw error;
}

export async function deleteFavorite(
  service: SupabaseService,
  userId: string,
  gameId: string,
) {
  const { error } = await service
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("game_id", gameId);
  if (error) throw error;
}

export async function findComments(
  service: SupabaseService,
  gameId: string,
  start: number,
  end: number,
) {
  const { data, error } = await service
    .from("comments")
    .select("id,content,created_at,user_id,profiles(username,avatar_url),comment_likes(user_id,is_like)")
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .range(start, end);
  if (error) throw error;
  return data || [];
}

export async function insertComment(
  service: SupabaseService,
  input: { content: string; gameId: string; userId: string },
) {
  const { error } = await service.from("comments").insert({
    content: input.content,
    game_id: input.gameId,
    user_id: input.userId,
  });
  if (error) throw error;
}

export async function deleteComment(
  service: SupabaseService,
  commentId: string,
  userId?: string,
) {
  let query = service.from("comments").delete().eq("id", commentId);
  if (userId) query = query.eq("user_id", userId);
  const { error } = await query;
  if (error) throw error;
}

export async function findGameReactions(service: SupabaseService, gameId: string) {
  const { data, error } = await service
    .from("likes")
    .select("user_id,is_like")
    .eq("game_id", gameId);
  if (error) throw error;
  return data || [];
}

export async function setGameReaction(
  service: SupabaseService,
  input: { gameId: string; isLike: boolean | null; userId: string },
) {
  const { error } = await service.rpc("set_game_reaction", {
    p_game_id: input.gameId,
    p_is_like: input.isLike,
    p_user_id: input.userId,
  });
  if (error) throw error;
}

export async function findCommentAuthorId(service: SupabaseService, commentId: string) {
  const { data, error } = await service
    .from("comments")
    .select("user_id")
    .eq("id", commentId)
    .maybeSingle<{ user_id: string | null }>();
  if (error) throw error;
  return data?.user_id || null;
}

export async function setCommentReaction(
  service: SupabaseService,
  input: { commentId: string; isLike: boolean | null; userId: string },
) {
  const { error } = await service.rpc("set_comment_reaction", {
    p_comment_id: input.commentId,
    p_is_like: input.isLike,
    p_user_id: input.userId,
  });
  if (error) throw error;
  const { data, error: loadError } = await service
    .from("comment_likes")
    .select("user_id,is_like")
    .eq("comment_id", input.commentId);
  if (loadError) throw loadError;
  return data || [];
}

export async function hasMatchingLiveSession(
  service: SupabaseService,
  input: {
    clientEdition: "studio" | "user";
    gameId: string;
    runtimeKind: "wasm" | "webrtc" | "native";
    userId: string;
  },
) {
  const { data, error } = await service
    .from("backend_sessions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("game_id", input.gameId)
    .eq("client_edition", input.clientEdition)
    .eq("client_runtime_kind", input.runtimeKind)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return Boolean(data);
}

export async function recordGamePlay(
  service: SupabaseService,
  input: {
    clientEdition: "studio" | "user";
    eventId: string;
    gameId: string;
    runtimeKind: "wasm" | "webrtc" | "native";
    userId: string;
  },
) {
  const { error } = await service.rpc("record_game_play", {
    p_client_edition: input.clientEdition,
    p_event_id: input.eventId,
    p_game_id: input.gameId,
    p_runtime_kind: input.runtimeKind,
    p_user_id: input.userId,
  });
  if (error) throw error;
}
