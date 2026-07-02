import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  collectHomebrewHubCandidates,
  type HomebrewHubRepository,
  type HomebrewHubSourceKind,
} from "../src/modules/catalog/ingestion/homebrewHubImporter.js";

dotenv.config();

type SourceConfig = {
  envName: string;
  rawBaseUrl: string;
  repoUrl: string;
  sourceKind: HomebrewHubSourceKind;
};

const SOURCES: SourceConfig[] = [
  {
    envName: "HOMEBREW_HUB_GB_REPO",
    rawBaseUrl: "https://raw.githubusercontent.com/gbdev/database",
    repoUrl: "https://github.com/gbdev/database",
    sourceKind: "homebrew_hub_gb",
  },
  {
    envName: "HOMEBREW_HUB_GBA_REPO",
    rawBaseUrl: "https://raw.githubusercontent.com/gbadev-org/games",
    repoUrl: "https://github.com/gbadev-org/games",
    sourceKind: "homebrew_hub_gba",
  },
  {
    envName: "HOMEBREW_HUB_NES_REPO",
    rawBaseUrl: "https://raw.githubusercontent.com/nesdev-org/homebrew-db",
    repoUrl: "https://github.com/nesdev-org/homebrew-db",
    sourceKind: "homebrew_hub_nes",
  },
];

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function repoRootFor(source: SourceConfig) {
  const cliName = `--${source.sourceKind.replace("homebrew_hub_", "")}`;
  return getArgValue(cliName) || process.env[source.envName];
}

function gitCommit(repoRoot: string) {
  return execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function repositoriesFromArgs(): HomebrewHubRepository[] {
  return SOURCES.flatMap((source) => {
    const repoRoot = repoRootFor(source);
    if (!repoRoot) return [];

    return [
      {
        commit: gitCommit(repoRoot),
        entriesDir: path.join(repoRoot, "entries"),
        rawBaseUrl: source.rawBaseUrl,
        repoUrl: source.repoUrl,
        sourceKind: source.sourceKind,
      },
    ];
  });
}

function toDatabaseRow(candidate: ReturnType<typeof collectHomebrewHubCandidates>[number]) {
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
  const repositories = repositoriesFromArgs();

  if (repositories.length === 0) {
    throw new Error(
      "No Homebrew Hub repositories configured. Pass --gb, --gba, and/or --nes, or set HOMEBREW_HUB_GB_REPO/HOMEBREW_HUB_GBA_REPO/HOMEBREW_HUB_NES_REPO.",
    );
  }

  const candidates = collectHomebrewHubCandidates(repositories);
  const rows = candidates.map(toDatabaseRow);

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

  process.stdout.write(`Imported ${rows.length} Homebrew Hub candidate(s).\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
