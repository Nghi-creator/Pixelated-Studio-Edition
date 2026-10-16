import fs from "node:fs";
import path from "node:path";
import { parseCaptureCommand } from "../../src/modules/catalog/ingestion/infrastructure/catalogArtworkCommand.js";
export function printHelp() {
  process.stdout.write(`Usage:
  npm --prefix services/api run capture:catalog-artwork -- --dry-run
  npm --prefix services/api run capture:catalog-artwork -- --apply --artwork-dir ./artwork
  npm --prefix services/api run capture:catalog-artwork -- --apply --capture-command "./scripts/catalog/captureRetroarchScreenshot.sh"

Options:
  --apply                  Upload separate cover/backdrop assets and update games.
  --allow-failures         Exit 0 even when individual games fail.
  --dry-run                List what would happen without mutating Supabase.
  --force                  Include games that already have non-generated artwork.
  --limit <n>              Process at most n games.
  --game-id <id>           Process one game id.
  --artwork-dir <dir>      Use existing PNG/JPG/WebP files before capture command.
  --capture-command <cmd>  Command that writes PIXELATED_CAPTURE_OUTPUT_PATH.
                           Quoted args are supported; shell metacharacters are not.

Capture command environment:
  PIXELATED_CAPTURE_ROM_PATH
  PIXELATED_CAPTURE_OUTPUT_PATH
  PIXELATED_CAPTURE_RUNTIME_ID
  PIXELATED_CAPTURE_PLATFORM_ID
  PIXELATED_CAPTURE_GAME_ID
  PIXELATED_CAPTURE_GAME_TITLE
  PIXELATED_CAPTURE_ARTIFACT_FILENAME

The command is dry-run by default. Supabase writes require --apply plus
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

Set CATALOG_ARTWORK_CAPTURE_COMMAND to the same command in the API environment
to opportunistically replace generated covers during candidate promotion.
`);
}
export function parseArtworkOptions(argv: string[] = process.argv.slice(2), environment: NodeJS.ProcessEnv = process.env) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueOptions = new Set(["--limit", "--game-id", "--artwork-dir", "--capture-command"]);
  const flagOptions = new Set(["--apply", "--allow-failures", "--dry-run", "--force", "--json"]);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]!;
    if (valueOptions.has(name)) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${name}.`);
      values.set(name, value);
    }
    else if (flagOptions.has(name))
      flags.add(name);
    else
      throw new Error(`Unknown artwork option: ${name}.`);
  }
  const rawLimit = values.get("--limit");
  const limit = rawLimit === undefined ? null : Number(rawLimit);
  if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0))
    throw new Error("--limit must be a positive integer.");
  let captureCommand = values.get("--capture-command") || null;
  if (captureCommand) {
    const parsed = parseCaptureCommand(captureCommand);
    if (parsed.file.startsWith(".") && !fs.existsSync(parsed.file) && environment.INIT_CWD) {
      const file = path.resolve(environment.INIT_CWD, parsed.file);
      if (fs.existsSync(file)) {
        const quote = (value: string) => '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
        captureCommand = [file, ...parsed.args].map(quote).join(" ");
      }
    }
  }
  return { apply: flags.has("--apply"), dryRun: !flags.has("--apply") || flags.has("--dry-run") || flags.has("--json"),
    json: flags.has("--json"), allowFailures: flags.has("--allow-failures"), force: flags.has("--force"),
    limit, gameId: values.get("--game-id") || null, artworkDir: values.has("--artwork-dir") ? path.resolve(values.get("--artwork-dir")!) : null, captureCommand };
}
