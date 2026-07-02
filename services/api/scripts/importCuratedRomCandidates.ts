import process from "node:process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  collectCuratedRomCandidates,
  collectCuratedRomCandidateReport,
  readCuratedRomManifest,
} from "../src/modules/catalog/ingestion/curatedRomManifestImporter.js";

dotenv.config();

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveManifestPath(manifestPath: string) {
  if (path.isAbsolute(manifestPath)) return manifestPath;
  return path.resolve(process.env.INIT_CWD || process.cwd(), manifestPath);
}

function toDatabaseRow(
  candidate: ReturnType<typeof collectCuratedRomCandidates>[number],
) {
  return {
    artifact_filename: candidate.artifactFilename,
    artifact_sha256: candidate.artifactSha256,
    artifact_size: candidate.artifactSize,
    artifact_url: candidate.artifactUrl,
    asset_license_spdx: candidate.assetLicenseSpdx,
    attribution_text: candidate.attributionText,
    code_license_spdx: candidate.codeLicenseSpdx,
    developer_name: candidate.developerName,
    developer_url: candidate.developerUrl,
    import_status: "needs_review",
    last_seen_at: new Date().toISOString(),
    license_url: candidate.licenseUrl,
    noncommercial_hosting_allowed: candidate.nonCommercialHostingAllowed,
    original_release_url: candidate.originalReleaseUrl,
    permission_evidence_url: candidate.permissionEvidenceUrl,
    platform_id: candidate.platformId,
    rights_warnings: candidate.rightsWarnings,
    runtime_id: candidate.runtimeId,
    runtime_kind: "libretro",
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
  const strict = hasArg("--strict");
  const manifestPath =
    getArgValue("--manifest") || process.env.CURATED_ROM_MANIFEST;
  if (!manifestPath) {
    throw new Error(
      "A curated ROM manifest is required. Pass --manifest or set CURATED_ROM_MANIFEST.",
    );
  }

  const manifest = readCuratedRomManifest(resolveManifestPath(manifestPath));
  const report = collectCuratedRomCandidateReport(manifest);
  const rows = report.candidates.map(toDatabaseRow);

  if (report.skipped.length > 0) {
    const summary = report.skipped
      .map((entry) => {
        const name = entry.title || entry.artifactFilename || `entry ${entry.index}`;
        return `- ${name}: ${entry.reasons.join(", ")}`;
      })
      .join("\n");
    const message = `Skipped ${report.skipped.length} curated ROM manifest entr${
      report.skipped.length === 1 ? "y" : "ies"
    }:\n${summary}`;
    if (strict) {
      throw new Error(message);
    }
    process.stderr.write(`${message}\n`);
  }

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
    onConflict: "source_kind,source_commit,source_entry_path,artifact_filename",
  });
  if (error) throw error;

  process.stdout.write(`Imported ${rows.length} curated ROM candidate(s).\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
