import { supabaseService } from "../../auth/supabaseAuth.js";
import type { CatalogArtworkImage } from "./catalogArtworkCapture.js";

export type SupabaseServiceLike = NonNullable<typeof supabaseService>;

export type CandidateRow = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_size: number | null;
  artifact_url: string | null;
  asset_license_spdx: string | null;
  attribution_text: string;
  code_license_spdx: string;
  cover_license_spdx: string | null;
  developer_name: string | null;
  developer_url: string | null;
  id: string;
  import_status: string;
  launch_manifest_id: string | null;
  license_url: string | null;
  noncommercial_hosting_allowed: boolean | null;
  original_release_url: string | null;
  package_component: string | null;
  package_name: string | null;
  package_version: string | null;
  permission_evidence_url: string | null;
  platform_id: string;
  review_notes: string | null;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
  source_kind: string;
  source_commit: string;
  source_entry_path: string;
  source_repo_url: string;
  title: string;
};

export type GameRow = { id: string };
export type GameBuildRow = { id: string };
export type GameRightsRow = { id: string };

export type CaptureGameplayArtwork = (input: {
  artifactBytes: Buffer;
  build: GameBuildRow;
  candidate: CandidateRow;
  game: GameRow & { title: string };
}) => Promise<CatalogArtworkImage | null>;

export const CANDIDATE_COLUMNS = [
  "id",
  "source_kind",
  "source_repo_url",
  "source_commit",
  "source_entry_path",
  "title",
  "developer_name",
  "developer_url",
  "runtime_kind",
  "runtime_id",
  "platform_id",
  "artifact_url",
  "artifact_filename",
  "artifact_size",
  "artifact_sha256",
  "launch_manifest_id",
  "package_name",
  "package_version",
  "package_component",
  "code_license_spdx",
  "asset_license_spdx",
  "cover_license_spdx",
  "license_url",
  "permission_evidence_url",
  "noncommercial_hosting_allowed",
  "original_release_url",
  "attribution_text",
  "rights_warnings",
  "import_status",
  "review_notes",
  "promoted_game_id",
  "promoted_build_id",
  "first_seen_at",
  "last_seen_at",
].join(",");
