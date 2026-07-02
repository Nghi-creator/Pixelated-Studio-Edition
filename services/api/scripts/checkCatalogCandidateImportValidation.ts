import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertCandidateRightsEvidence,
  assertCandidateRuntimeAllowed,
} from "../src/modules/catalog/ingestion/catalogCandidateValidation.js";
import {
  collectCuratedRomCandidateReport,
  readCuratedRomManifest,
} from "../src/modules/catalog/ingestion/curatedRomManifestImporter.js";
import {
  collectDebianNativeCandidates,
  readDebianNativeLockManifest,
} from "../src/modules/catalog/ingestion/debianNativeImporter.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

function defaultCuratedManifestPath() {
  return path.resolve(
    scriptDir,
    "../tests/unit/fixtures/curated-roms/phase5-curated-roms.json",
  );
}

function defaultNativeLockPath() {
  return path.resolve(repoRoot, "engine/runtime/native-runtime.lock.json");
}

function validateCuratedCandidates(manifestPath: string) {
  const report = collectCuratedRomCandidateReport(readCuratedRomManifest(manifestPath));
  if (report.skipped.length > 0) {
    const summary = report.skipped
      .map((entry) => {
        const name = entry.title || entry.artifactFilename || `entry ${entry.index}`;
        return `- ${name}: ${entry.reasons.join(", ")}`;
      })
      .join("\n");
    throw new Error(`Curated ROM import validation skipped entries:\n${summary}`);
  }
  if (report.candidates.length === 0) {
    throw new Error("Curated ROM import validation found no candidates.");
  }

  for (const candidate of report.candidates) {
    assertCandidateRuntimeAllowed({
      artifact_filename: candidate.artifactFilename,
      launch_manifest_id: null,
      platform_id: candidate.platformId,
      runtime_id: candidate.runtimeId,
      runtime_kind: "libretro",
    });
    assertCandidateRightsEvidence({
      asset_license_spdx: candidate.assetLicenseSpdx,
      attribution_text: candidate.attributionText,
      code_license_spdx: candidate.codeLicenseSpdx,
      license_url: candidate.licenseUrl,
      noncommercial_hosting_allowed: candidate.nonCommercialHostingAllowed,
      permission_evidence_url: candidate.permissionEvidenceUrl,
      source_commit: candidate.sourceCommit,
      source_entry_path: candidate.sourceEntryPath,
      source_kind: candidate.sourceKind,
      source_repo_url: candidate.sourceRepoUrl,
    });
  }

  return report.candidates.length;
}

function validateNativeCandidates(lockPath: string) {
  process.env.PIXELATED_NATIVE_RUNTIME_LOCK_PATH = lockPath;
  const manifest = readDebianNativeLockManifest(lockPath);
  const candidates = collectDebianNativeCandidates(manifest);
  if (candidates.length === 0) {
    throw new Error("Debian native import validation found no candidates.");
  }

  for (const candidate of candidates) {
    assertCandidateRuntimeAllowed({
      artifact_filename: null,
      launch_manifest_id: candidate.launchManifestId,
      platform_id: candidate.platformId,
      runtime_id: candidate.runtimeId,
      runtime_kind: "native_linux",
    });
    assertCandidateRightsEvidence({
      asset_license_spdx: candidate.assetLicenseSpdx,
      attribution_text: candidate.attributionText,
      code_license_spdx: candidate.codeLicenseSpdx,
      license_url: candidate.licenseUrl,
      noncommercial_hosting_allowed: candidate.nonCommercialHostingAllowed,
      permission_evidence_url: candidate.permissionEvidenceUrl,
      source_commit: candidate.sourceCommit,
      source_entry_path: candidate.sourceEntryPath,
      source_kind: candidate.sourceKind,
      source_repo_url: candidate.sourceRepoUrl,
    });
  }

  return candidates.length;
}

const curatedManifestPath =
  process.env.CURATED_ROM_IMPORT_CHECK_MANIFEST || defaultCuratedManifestPath();
const nativeLockPath =
  process.env.DEBIAN_NATIVE_IMPORT_CHECK_LOCK || defaultNativeLockPath();

try {
  const curatedCount = validateCuratedCandidates(curatedManifestPath);
  const nativeCount = validateNativeCandidates(nativeLockPath);
  process.stdout.write(
    `Validated ${curatedCount} curated ROM candidate(s) and ${nativeCount} Debian native candidate(s).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
