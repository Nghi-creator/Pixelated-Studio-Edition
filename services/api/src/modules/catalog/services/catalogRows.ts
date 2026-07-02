import { supabaseService } from "../../auth/supabaseAuth.js";

export type CatalogService = NonNullable<typeof supabaseService>;

export type CatalogGameRow = {
  author_name?: string | null;
  backdrop_url?: string | null;
  cover_url?: string | null;
  developer_name?: string | null;
  developer_url?: string | null;
  id: string;
  play_count?: number | null;
  publication_status?: string | null;
  rom_filename?: string | null;
  rom_url?: string | null;
  title?: string | null;
};

export type GameBuildRow = {
  artifact_filename: string | null;
  artifact_sha256?: string | null;
  artifact_size?: number | null;
  artifact_url: string | null;
  enabled: boolean;
  game_id: string;
  id: string;
  launch_manifest_id?: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
};

export type GameRightsRow = {
  asset_license_spdx?: string | null;
  attribution_text?: string | null;
  code_license_spdx?: string | null;
  commercial_use_allowed?: boolean | null;
  cover_license_spdx?: string | null;
  game_build_id: string | null;
  game_id: string;
  id?: string;
  license_url?: string | null;
  modification_allowed?: boolean | null;
  noncommercial_hosting_allowed?: boolean | null;
  original_release_url?: string | null;
  permission_evidence_url?: string | null;
  review_notes?: string | null;
  source_url?: string | null;
  verified_at: string | null;
};

export type PublishedCatalogGame = CatalogGameRow & {
  game_builds: GameBuildRow[];
  game_rights: GameRightsRow[];
};

export type PublishedCatalogGameRpcRow = CatalogGameRow & {
  game_builds?: GameBuildRow[] | null;
  game_rights?: GameRightsRow[] | null;
};

export const PUBLIC_CATALOG_GAME_COLUMNS = [
  "id",
  "title",
  "author_name",
  "developer_name",
  "developer_url",
  "rom_url",
  "rom_filename",
  "cover_url",
  "backdrop_url",
  "play_count",
  "publication_status",
].join(",");

export const ENABLED_BUILD_COLUMNS = [
  "id",
  "game_id",
  "runtime_kind",
  "runtime_id",
  "platform_id",
  "artifact_url",
  "artifact_filename",
  "artifact_size",
  "artifact_sha256",
  "launch_manifest_id",
  "enabled",
].join(",");

export const VERIFIED_RIGHTS_COLUMNS = [
  "id",
  "game_id",
  "game_build_id",
  "code_license_spdx",
  "asset_license_spdx",
  "cover_license_spdx",
  "license_url",
  "source_url",
  "original_release_url",
  "permission_evidence_url",
  "attribution_text",
  "commercial_use_allowed",
  "modification_allowed",
  "noncommercial_hosting_allowed",
  "review_notes",
  "verified_at",
].join(",");
