import "dotenv/config";
import { withRequestDeadline } from "../src/infrastructure/boundedRead.js";
import { createClient } from "@supabase/supabase-js";
import { parseArtworkOptions, printHelp } from "./artwork/options.js";
import { loadTargets, uploadArtwork } from "./artwork/catalog.js";
import { withCapturedArtwork } from "./artwork/capture.js";
import type { CatalogSupabaseClient } from "./artwork/types.js";
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  const options = parseArtworkOptions();
  const { apply, dryRun } = options;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put them in services/api/.env or export them before running.");
  }
  if (apply && !options.artworkDir && !options.captureCommand) {
    throw new Error("--apply requires --artwork-dir or --capture-command.");
  }
  const service: CatalogSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { fetch: withRequestDeadline(fetch, 30000) },
  });
  const targets = await loadTargets(service, options);
  if (targets.length === 0) {
    process.stdout.write("No catalog games need artwork.\n");
    return;
  }
  const report = [];
  for (const target of targets) {
    const prefix = dryRun ? "would process" : "processing";
    process.stdout.write(`${prefix}: ${target.game.title} (${target.build.platform_id || "unknown"}, ${target.build.runtime_id || "unknown"})\n`);
    try {
      await withCapturedArtwork(target, options, async (result) => {
        if (result.source === "none") {
          report.push({
            gameId: target.game.id,
            status: "skipped",
            title: target.game.title,
            reason: result.reason,
          });
          process.stdout.write(`  skipped: ${result.reason}\n`);
          return;
        }
        if (dryRun) {
          report.push({
            gameId: target.game.id,
            imagePath: result.imagePath,
            imageRetained: result.source === "local-artwork",
            source: result.source,
            status: "ready",
            title: target.game.title,
          });
          process.stdout.write(`  ready: ${result.imagePath} (${result.source})\n`);
          return;
        }
        const upload = await uploadArtwork(service, target, result.imagePath);
        report.push({
          backdropObjectPath: upload.backdrop.objectPath,
          backdropUrl: upload.backdrop.publicUrl,
          coverObjectPath: upload.cover.objectPath,
          coverUrl: upload.cover.publicUrl,
          gameId: target.game.id,
          source: result.source,
          status: "uploaded",
          title: target.game.title,
        });
        process.stdout.write(`  uploaded backdrop: ${upload.backdrop.publicUrl}\n`);
        process.stdout.write(`  uploaded cover: ${upload.cover.publicUrl}\n`);
      });
    }
    catch (error) {
      const reason = errorMessage(error);
      report.push({
        gameId: target.game.id,
        reason,
        status: "failed",
        title: target.game.title,
      });
      process.stderr.write(`  failed: ${reason}\n`);
    }
  }
  const counts = report.reduce((summary, entry) => {
    const status = typeof entry.status === "string" ? entry.status : "unknown";
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {} as Record<string, number>);
  process.stdout.write(`catalog artwork summary: uploaded=${counts.uploaded || 0}, ready=${counts.ready || 0}, skipped=${counts.skipped || 0}, failed=${counts.failed || 0}\n`);
  const failed = report.filter((entry) => entry.status === "failed");
  if (failed.length > 0) {
    process.stderr.write("failed games:\n");
    for (const entry of failed) {
      process.stderr.write(`- ${entry.title}: ${entry.reason}\n`);
    }
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (failed.length > 0 && !options.allowFailures) {
    process.exitCode = 1;
  }
}
main().catch(error => { console.error(errorMessage(error)); process.exitCode = 1; });
