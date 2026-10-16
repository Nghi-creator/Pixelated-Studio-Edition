export type GameRow = {
  backdrop_url: string | null;
  cover_url: string | null;
  id: string;
  publication_status: string | null;
  title: string;
};
export type BuildRow = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_url: string | null;
  enabled: boolean | null;
  game_id: string;
  id: string;
  platform_id: string | null;
  runtime_id: string | null;
  runtime_kind: string | null;
};
export type CaptureTarget = {
  build: BuildRow;
  game: GameRow;
};
export type CaptureResult = {
  imagePath: string;
  source: "capture-command" | "local-artwork";
} | {
  reason: string;
  source: "none";
};
export type CatalogSupabaseClient = import("@supabase/supabase-js").SupabaseClient;
