import {
  assertCandidateRuntimeAllowed,
  CandidateValidationError,
} from "../../catalog/ingestion/catalogCandidateValidation.js";
import type { BackendSessionRow } from "../services/backendSessions.js";

export function mapBoot(
  row: BackendSessionRow,
  options: { artifactUrlExpiresAt?: string | null; romUrl?: string | null } = {},
) {
  return {
    artifactSha256: row.boot_artifact_sha256,
    artifactSize: row.boot_artifact_size,
    browser: {
      artifactUrlExpiresAt: options.artifactUrlExpiresAt || null,
      coreId: row.browser_core_id,
      eligible: Boolean(options.romUrl && row.browser_core_id && row.browser_system_id),
      reason: row.browser_core_id ? null : "This session is not eligible for browser play.",
      systemId: row.browser_system_id,
    },
    launchManifestId: row.boot_launch_manifest_id,
    romFilename: row.boot_rom_filename,
    romUrl: options.romUrl === undefined ? row.boot_rom_url : options.romUrl,
    runtimeId: row.boot_runtime_id,
    runtimeKind:
      row.boot_launch_manifest_id && !row.boot_rom_url && !row.boot_rom_filename
        ? "native_linux"
        : "libretro",
  };
}

export function assertBuildBootable(build: {
  artifact_filename: string | null;
  artifact_sha256?: string | null;
  artifact_size?: number | null;
  artifact_url: string | null;
  launch_manifest_id?: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
}) {
  assertCandidateRuntimeAllowed({
    artifact_filename: build.artifact_filename,
    launch_manifest_id: build.launch_manifest_id || null,
    platform_id: build.platform_id,
    runtime_id: build.runtime_id,
    runtime_kind: build.runtime_kind,
  });

  if (build.runtime_kind === "libretro") {
    if (!build.artifact_url && !build.artifact_filename) {
      throw new CandidateValidationError("Game has no ROM target.");
    }
    if (
      typeof build.artifact_size !== "number" ||
      !Number.isFinite(build.artifact_size) ||
      build.artifact_size <= 0
    ) {
      throw new CandidateValidationError(
        "Game build is missing a verified artifact size.",
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(build.artifact_sha256 || "")) {
      throw new CandidateValidationError(
        "Game build is missing a verified artifact checksum.",
      );
    }
    return;
  }

  if (build.artifact_url || build.artifact_filename) {
    throw new CandidateValidationError(
      "Native game builds must not define ROM artifacts.",
    );
  }
}
