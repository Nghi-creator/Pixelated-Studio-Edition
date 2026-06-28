import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

type CatalogSupabaseClient = SupabaseClient<any, "public", any, any, any>;

type BuildRow = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_size: number | null;
  artifact_url: string | null;
  enabled: boolean | null;
  game_id: string;
  id: string;
  platform_id: string | null;
  runtime_id: string | null;
  runtime_kind: string | null;
};

type MirrorReportEntry = {
  buildId: string;
  fromUrl: string;
  gameId: string;
  reason?: string;
  status: "failed" | "mirrored" | "ready" | "skipped";
  toUrl?: string;
};

const RAW_GITHUB_HOST = "raw.githubusercontent.com";
const BUCKET_NAME = "catalog_artifacts";

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printHelp() {
  process.stdout.write(`Usage:
  npm --prefix services/api run mirror:catalog-artifacts -- --dry-run
  npm --prefix services/api run mirror:catalog-artifacts -- --apply

Options:
  --apply             Upload to Supabase Storage and update game_builds.
  --dry-run           List work without mutating Supabase. Default.
  --limit <n>         Process at most n matching builds.
  --build-id <id>     Process one game_builds row.
  --allow-failures    Exit 0 even when individual builds fail.
  --json              Print JSON report.

Only https://raw.githubusercontent.com/... game_builds artifact_url rows are
mirrored. Each artifact must match the existing artifact_sha256, and
artifact_size is verified when present.
`);
}

function parseLimit() {
  const raw = getArgValue("--limit");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("--limit must be a positive integer.");
  }
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeObjectSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "artifact"
  );
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertRawGithubUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Artifact URL is invalid.");
  }

  if (url.protocol !== "https:" || url.hostname !== RAW_GITHUB_HOST) {
    throw new Error(`Artifact URL is not a ${RAW_GITHUB_HOST} URL.`);
  }
}

function objectPathForBuild(build: BuildRow) {
  const artifactFilename =
    build.artifact_filename || path.basename(new URL(build.artifact_url || "").pathname);
  const extension = path.extname(artifactFilename || "").toLowerCase();
  const safeFilename = sanitizeObjectSegment(
    artifactFilename || `${build.id}${extension || ".rom"}`,
  );

  return [
    "mirrored-roms",
    sanitizeObjectSegment(build.platform_id || "unknown"),
    sanitizeObjectSegment(build.game_id),
    `${sanitizeObjectSegment(build.artifact_sha256 || build.id)}-${safeFilename}`,
  ].join("/");
}

async function loadTargets(
  service: CatalogSupabaseClient,
  options: { buildId: string | null; limit: number | null },
) {
  let query = service
    .from("game_builds")
    .select(
      "id,game_id,runtime_kind,runtime_id,platform_id,artifact_url,artifact_filename,artifact_sha256,artifact_size,enabled",
    )
    .eq("runtime_kind", "libretro")
    .not("artifact_url", "is", null)
    .order("platform_id", { ascending: true });

  if (options.buildId) {
    query = query.eq("id", options.buildId);
  }

  const { data, error } = await query.returns<BuildRow[]>();
  if (error) throw error;

  const targets = (data || []).filter((build) => {
    if (!build.artifact_url) return false;
    try {
      const url = new URL(build.artifact_url);
      return url.protocol === "https:" && url.hostname === RAW_GITHUB_HOST;
    } catch {
      return false;
    }
  });

  return options.limit ? targets.slice(0, options.limit) : targets;
}

async function downloadAndVerify(build: BuildRow) {
  if (!build.artifact_url) {
    throw new Error("Build is missing artifact_url.");
  }
  if (!build.artifact_sha256) {
    throw new Error("Build is missing artifact_sha256; refusing to mirror.");
  }

  assertRawGithubUrl(build.artifact_url);
  const response = await fetch(build.artifact_url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (build.artifact_size !== null && bytes.length !== build.artifact_size) {
    throw new Error(
      `Artifact size mismatch: expected ${build.artifact_size}, got ${bytes.length}.`,
    );
  }

  const actualSha256 = sha256(bytes);
  if (actualSha256 !== build.artifact_sha256) {
    throw new Error(
      `Artifact checksum mismatch: expected ${build.artifact_sha256}, got ${actualSha256}.`,
    );
  }

  return bytes;
}

async function uploadMirroredArtifact(
  service: CatalogSupabaseClient,
  build: BuildRow,
  bytes: Buffer,
) {
  const objectPath = objectPathForBuild(build);
  const bucket = service.storage.from(BUCKET_NAME);
  const { error: uploadError } = await bucket.upload(objectPath, bytes, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve mirrored artifact public URL.");
  }

  const { error: updateError } = await service
    .from("game_builds")
    .update({
      artifact_size: bytes.length,
      artifact_url: data.publicUrl,
    })
    .eq("id", build.id);
  if (updateError) throw updateError;

  return data.publicUrl;
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const apply = hasArg("--apply");
  const dryRun = !apply || hasArg("--dry-run");
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put them in services/api/.env or export them before running.",
    );
  }

  const service: CatalogSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const targets = await loadTargets(service, {
    buildId: getArgValue("--build-id") || null,
    limit: parseLimit(),
  });

  if (targets.length === 0) {
    process.stdout.write("No raw GitHub catalog artifacts need mirroring.\n");
    return;
  }

  const report: MirrorReportEntry[] = [];
  for (const build of targets) {
    const fromUrl = build.artifact_url || "";
    process.stdout.write(
      `${dryRun ? "would mirror" : "mirroring"}: ${build.id} (${build.platform_id || "unknown"}, ${build.runtime_id || "unknown"})\n`,
    );

    try {
      const bytes = await downloadAndVerify(build);
      const objectPath = objectPathForBuild(build);
      if (dryRun) {
        report.push({
          buildId: build.id,
          fromUrl,
          gameId: build.game_id,
          status: "ready",
          toUrl: `${BUCKET_NAME}/${objectPath}`,
        });
        process.stdout.write(`  ready: ${bytes.length} bytes -> ${BUCKET_NAME}/${objectPath}\n`);
        continue;
      }

      const publicUrl = await uploadMirroredArtifact(service, build, bytes);
      report.push({
        buildId: build.id,
        fromUrl,
        gameId: build.game_id,
        status: "mirrored",
        toUrl: publicUrl,
      });
      process.stdout.write(`  mirrored: ${publicUrl}\n`);
    } catch (error) {
      const reason = errorMessage(error);
      report.push({
        buildId: build.id,
        fromUrl,
        gameId: build.game_id,
        reason,
        status: "failed",
      });
      process.stderr.write(`  failed: ${reason}\n`);
    }
  }

  const counts = report.reduce(
    (summary, entry) => {
      summary[entry.status] = (summary[entry.status] || 0) + 1;
      return summary;
    },
    {} as Record<string, number>,
  );
  process.stdout.write(
    `catalog artifact mirror summary: mirrored=${counts.mirrored || 0}, ready=${
      counts.ready || 0
    }, failed=${counts.failed || 0}\n`,
  );

  const failed = report.filter((entry) => entry.status === "failed");
  if (failed.length > 0) {
    process.stderr.write("failed builds:\n");
    for (const entry of failed) {
      process.stderr.write(`- ${entry.buildId}: ${entry.reason}\n`);
    }
  }

  if (hasArg("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  if (failed.length > 0 && !hasArg("--allow-failures")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
