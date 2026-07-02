import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  collectDebianNativeCandidates,
  readDebianNativeLockManifest,
} from "../src/modules/catalog/ingestion/debianNativeImporter.js";

dotenv.config();

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function defaultManifestPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(
    scriptDir,
    "../../../engine/runtime/native-runtime.lock.json",
  );
}

function toDatabaseRow(
  candidate: ReturnType<typeof collectDebianNativeCandidates>[number],
) {
  return {
    artifact_filename: null,
    artifact_sha256: null,
    artifact_size: null,
    artifact_url: null,
    asset_license_spdx: candidate.assetLicenseSpdx,
    attribution_text: candidate.attributionText,
    code_license_spdx: candidate.codeLicenseSpdx,
    developer_name: candidate.developerName,
    developer_url: candidate.developerUrl,
    import_status: "needs_review",
    last_seen_at: new Date().toISOString(),
    launch_manifest_id: candidate.launchManifestId,
    license_url: candidate.licenseUrl,
    noncommercial_hosting_allowed: candidate.nonCommercialHostingAllowed,
    original_release_url: candidate.originalReleaseUrl,
    package_component: candidate.packageComponent,
    package_name: candidate.packageName,
    package_version: candidate.packageVersion,
    permission_evidence_url: candidate.permissionEvidenceUrl,
    platform_id: candidate.platformId,
    rights_warnings: candidate.rightsWarnings,
    runtime_id: candidate.runtimeId,
    runtime_kind: "native_linux",
    source_commit: candidate.sourceCommit,
    source_entry_path: candidate.sourceEntryPath,
    source_kind: candidate.sourceKind,
    source_metadata: candidate.sourceMetadata,
    source_repo_url: candidate.sourceRepoUrl,
    title: candidate.title,
  };
}

async function main() {
  const dryRun = hasArg("--dry-run") || hasArg("--json");
  const manifestPath =
    getArgValue("--manifest") ||
    process.env.DEBIAN_NATIVE_LOCK_MANIFEST ||
    defaultManifestPath();
  const manifest = readDebianNativeLockManifest(manifestPath);
  const rows = collectDebianNativeCandidates(manifest).map(toDatabaseRow);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is set.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("catalog_ingestion_candidates").upsert(rows, {
    onConflict: "source_kind,source_commit,source_entry_path,launch_manifest_id",
  });
  if (error) throw error;

  process.stdout.write(`Imported ${rows.length} Debian native candidate(s).\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
