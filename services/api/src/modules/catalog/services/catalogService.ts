import { supabaseService } from "../../auth/supabaseAuth.js";
import { timed, type TimingFields } from "../../observability/timing.js";
import { selectFeaturedGames } from "../domain/catalogPolicy.js";

type ProfileRole = { role: string | null };

export type CatalogService = NonNullable<typeof supabaseService>;

export async function fetchFeaturedGames(
  service: CatalogService,
  timings: TimingFields,
) {
  const { data, error } = await timed(
    timings,
    "featured_games_query_ms",
    () =>
      service
        .from("games")
        .select("id,title,cover_url,backdrop_url,play_count")
        .order("play_count", { ascending: false })
        .limit(100),
  );
  if (error) throw error;
  return selectFeaturedGames(data || []);
}

export async function getUserRole(
  service: CatalogService | null,
  userId: string,
) {
  if (!service) return null;
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();
  if (error) throw error;
  return data?.role || null;
}
