import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  isGeneratedCatalogArtworkUrl,
  parseCaptureCommand,
  uploadGameplayArtworkFromFile,
} from "../src/modules/catalog/ingestion/catalogArtworkCapture.js";

dotenv.config();

type GameRow = {
  backdrop_url: string | null;
  cover_url: string | null;
  id: string;
  publication_status: string | null;
  title: string;
};

type BuildRow = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_url: string | null;
  enabled: boolean | null;
  game_id: string;
  id: string;
  platform_id: string | null;
  runtime_id: string | null;
  runtime_kind: string | null;
};

type CaptureTarget = {
  build: BuildRow;
  game: GameRow;
};

type CatalogSupabaseClient = SupabaseClient<any, "public", any, any, any>;

type CaptureResult =
  | {
      imagePath: string;
      source: "capture-command" | "local-artwork";
    }
  | {
      reason: string;
      source: "none";
    };

const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function resolveCaptureCommand(value: string | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  const [firstToken, ...rest] = trimmed.split(/\s+/);
  if (!firstToken?.startsWith(".")) return trimmed;
  if (fs.existsSync(firstToken)) return trimmed;

  const initCwd = process.env.INIT_CWD;
  if (!initCwd) return trimmed;

  const fromInitialDirectory = path.resolve(initCwd, firstToken);
  if (!fs.existsSync(fromInitialDirectory)) return trimmed;

  return [shellQuote(fromInitialDirectory), ...rest].join(" ");
}

function printHelp() {
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
      .slice(0, 120) || "artwork"
  );
}

function slugForTitle(value: string) {
  return sanitizeObjectSegment(value.toLowerCase()).toLowerCase();
}

function needsArtwork(game: GameRow) {
  return !game.cover_url || isGeneratedCatalogArtworkUrl(game.cover_url);
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createImageDataUri(bytes: Buffer, contentType: string) {
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function fileExists(filePath: string) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function readUInt32(bytes: Buffer, offset: number) {
  return bytes.readUInt32BE(offset);
}

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function assertUsefulPngCapture(bytes: Buffer, filePath: string) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8] || 0;
      colorType = data[9] || 0;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    return;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const previous = Buffer.alloc(rowLength);
  const current = Buffer.alloc(rowLength);
  let nonBlackPixels = 0;
  let sampledPixels = 0;
  let brightnessTotal = 0;
  const colors = new Set<string>();
  let inflatedOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inflatedOffset];
    inflatedOffset += 1;
    inflated.copy(current, 0, inflatedOffset, inflatedOffset + rowLength);
    inflatedOffset += rowLength;

    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] || 0 : 0;
      const above = previous[x] || 0;
      const upperLeft =
        x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;

      if (filter === 1) {
        current[x] = (current[x] + left) & 0xff;
      } else if (filter === 2) {
        current[x] = (current[x] + above) & 0xff;
      } else if (filter === 3) {
        current[x] = (current[x] + Math.floor((left + above) / 2)) & 0xff;
      } else if (filter === 4) {
        current[x] = (current[x] + paethPredictor(left, above, upperLeft)) & 0xff;
      }
    }

    for (let x = 0; x < rowLength; x += bytesPerPixel * 8) {
      const r = current[x] || 0;
      const g = current[x + 1] || 0;
      const b = current[x + 2] || 0;
      const brightness = (r + g + b) / 3;
      sampledPixels += 1;
      brightnessTotal += brightness;
      if (brightness > 18) nonBlackPixels += 1;
      colors.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    }

    current.copy(previous);
  }

  const nonBlackRatio = sampledPixels > 0 ? nonBlackPixels / sampledPixels : 0;
  const averageBrightness =
    sampledPixels > 0 ? brightnessTotal / sampledPixels : 0;
  if (nonBlackRatio < 0.005 || colors.size < 2 || averageBrightness < 0.5) {
    throw new Error(
      `Captured artwork looks blank/invalid (${Math.round(
        nonBlackRatio * 100,
      )}% non-black, ${colors.size} colors, ${Math.round(
        averageBrightness,
      )} avg brightness): ${filePath}`,
    );
  }
}

async function assertReadableImage(filePath: string) {
  const bytes = await fsp.readFile(filePath);
  if (bytes.length < 16) {
    throw new Error(`Captured artwork is empty: ${filePath}`);
  }

  const isPng = bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if (!isPng && !isJpeg && !isWebp) {
    throw new Error(`Captured artwork must be PNG, JPEG, or WebP: ${filePath}`);
  }

  if (isPng) assertUsefulPngCapture(bytes, filePath);
}

async function findLocalArtwork(target: CaptureTarget, artworkDir: string | null) {
  if (!artworkDir) return null;

  const names = [
    target.game.id,
    slugForTitle(target.game.title),
    target.build.id,
    target.build.artifact_sha256 || "",
    target.build.artifact_filename
      ? path.basename(target.build.artifact_filename, path.extname(target.build.artifact_filename))
      : "",
  ].filter(Boolean);

  for (const name of names) {
    for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
      const candidate = path.resolve(artworkDir, `${name}${extension}`);
      if (await fileExists(candidate)) return candidate;
    }
  }

  return null;
}

async function downloadArtifact(target: CaptureTarget, destinationPath: string) {
  if (!target.build.artifact_url) {
    throw new Error(`${target.game.title} does not have an artifact URL.`);
  }

  const response = await fetch(target.build.artifact_url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${target.game.title} artifact: HTTP ${response.status}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (target.build.artifact_sha256) {
    const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== target.build.artifact_sha256) {
      throw new Error(
        `${target.game.title} artifact checksum mismatch: expected ${target.build.artifact_sha256}, got ${actualSha256}`,
      );
    }
  }

  await fsp.writeFile(destinationPath, bytes);
}

function runCaptureCommand(
  command: string,
  target: CaptureTarget,
  paths: {
    outputPath: string;
    romPath: string;
  },
) {
  const captureDelaySeconds = Number(
    process.env.PIXELATED_CAPTURE_DELAY_SECONDS || 35,
  );
  const defaultTimeoutMs =
    (Number.isFinite(captureDelaySeconds) ? captureDelaySeconds : 35) * 1000 +
    90_000;
  const timeoutMs = Number(
    process.env.CATALOG_ARTWORK_CAPTURE_TIMEOUT_MS || defaultTimeoutMs,
  );

  return new Promise<void>((resolve, reject) => {
    const parsedCommand = parseCaptureCommand(command);
    const child = spawn(parsedCommand.file, parsedCommand.args, {
      env: {
        ...process.env,
        PIXELATED_CAPTURE_ARTIFACT_FILENAME: target.build.artifact_filename || "",
        PIXELATED_CAPTURE_GAME_ID: target.game.id,
        PIXELATED_CAPTURE_GAME_TITLE: target.game.title,
        PIXELATED_CAPTURE_OUTPUT_PATH: paths.outputPath,
        PIXELATED_CAPTURE_PLATFORM_ID: target.build.platform_id || "",
        PIXELATED_CAPTURE_ROM_PATH: paths.romPath,
        PIXELATED_CAPTURE_RUNTIME_ID: target.build.runtime_id || "",
      },
      stdio: "inherit",
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Capture command timed out after ${timeoutMs}ms for ${target.game.title}.`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Capture command failed for ${target.game.title}: ${
            signal ? `signal ${signal}` : `exit ${code}`
          }`,
        ),
      );
    });
  });
}

async function captureArtwork(
  target: CaptureTarget,
  options: {
    artworkDir: string | null;
    captureCommand: string | null;
  },
): Promise<CaptureResult> {
  const localArtwork = await findLocalArtwork(target, options.artworkDir);
  if (localArtwork) {
    await assertReadableImage(localArtwork);
    return {
      imagePath: localArtwork,
      source: "local-artwork",
    };
  }

  if (!options.captureCommand) {
    return {
      reason: "no local artwork matched and no --capture-command was provided",
      source: "none",
    };
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pixelated-artwork-"));
  const artifactExtension =
    path.extname(target.build.artifact_filename || "").toLowerCase() || ".rom";
  const romPath = path.join(tempDir, `game${artifactExtension}`);
  const outputPath = path.join(tempDir, "capture.png");

  await downloadArtifact(target, romPath);
  await runCaptureCommand(options.captureCommand, target, {
    outputPath,
    romPath,
  });
  await assertReadableImage(outputPath);

  return {
    imagePath: outputPath,
    source: "capture-command",
  };
}

async function uploadObject(
  service: CatalogSupabaseClient,
  objectPath: string,
  bytes: Buffer,
  contentType: string,
) {
  const bucket = service.storage.from("catalog_artifacts");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error(`Failed to resolve public URL for ${objectPath}.`);
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}

async function uploadArtwork(
  service: CatalogSupabaseClient,
  target: CaptureTarget,
  imagePath: string,
) {
  const { backdrop, cover } = await uploadGameplayArtworkFromFile(
    service as never,
    {
      build: {
        artifact_filename: target.build.artifact_filename,
        artifact_sha256: target.build.artifact_sha256,
        id: target.build.id,
      },
      game: {
        id: target.game.id,
        title: target.game.title,
      },
    },
    imagePath,
  );

  const { error: updateError } = await service
    .from("games")
    .update({
      backdrop_url: backdrop.publicUrl,
      cover_url: cover.publicUrl,
    })
    .eq("id", target.game.id);
  if (updateError) throw updateError;

  return {
    backdrop,
    cover,
  };
}

async function loadTargets(
  service: CatalogSupabaseClient,
  options: {
    force: boolean;
    gameId: string | null;
    limit: number | null;
  },
) {
  let gamesQuery = service
    .from("games")
    .select("id,title,cover_url,backdrop_url,publication_status")
    .eq("publication_status", "published")
    .order("title", { ascending: true });

  if (options.gameId) {
    gamesQuery = gamesQuery.eq("id", options.gameId);
  }

  const { data: games, error: gamesError } = await gamesQuery.returns<GameRow[]>();
  if (gamesError) throw gamesError;

  const gameIds = (games || []).map((game) => game.id);
  if (gameIds.length === 0) return [];

  const { data: builds, error: buildsError } = await service
    .from("game_builds")
    .select(
      "id,game_id,runtime_kind,runtime_id,platform_id,artifact_url,artifact_filename,artifact_sha256,enabled",
    )
    .in("game_id", gameIds)
    .eq("enabled", true)
    .eq("runtime_kind", "libretro")
    .not("artifact_url", "is", null)
    .order("created_at", { ascending: true })
    .returns<BuildRow[]>();
  if (buildsError) throw buildsError;

  const buildsByGame = new Map<string, BuildRow>();
  for (const build of builds || []) {
    if (!buildsByGame.has(build.game_id)) buildsByGame.set(build.game_id, build);
  }

  const targets = (games || [])
    .filter((game) => options.force || needsArtwork(game))
    .flatMap((game): CaptureTarget[] => {
      const build = buildsByGame.get(game.id);
      return build ? [{ build, game }] : [];
    });

  return options.limit ? targets.slice(0, options.limit) : targets;
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const apply = hasArg("--apply");
  const dryRun = !apply || hasArg("--dry-run") || hasArg("--json");
  const options = {
    artworkDir: getArgValue("--artwork-dir")
      ? path.resolve(String(getArgValue("--artwork-dir")))
      : null,
    captureCommand: resolveCaptureCommand(getArgValue("--capture-command")),
    force: hasArg("--force"),
    gameId: getArgValue("--game-id") || null,
    limit: parseLimit(),
  };

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put them in services/api/.env or export them before running.",
    );
  }

  if (apply && !options.artworkDir && !options.captureCommand) {
    throw new Error("--apply requires --artwork-dir or --capture-command.");
  }

  const service: CatalogSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const targets = await loadTargets(service, options);

  if (targets.length === 0) {
    process.stdout.write("No catalog games need artwork.\n");
    return;
  }

  const report = [];
  for (const target of targets) {
    const prefix = dryRun ? "would process" : "processing";
    process.stdout.write(
      `${prefix}: ${target.game.title} (${target.build.platform_id || "unknown"}, ${target.build.runtime_id || "unknown"})\n`,
    );

    try {
      const result = await captureArtwork(target, options);
      if (result.source === "none") {
        report.push({
          gameId: target.game.id,
          status: "skipped",
          title: target.game.title,
          reason: result.reason,
        });
        process.stdout.write(`  skipped: ${result.reason}\n`);
        continue;
      }

      if (dryRun) {
        report.push({
          gameId: target.game.id,
          imagePath: result.imagePath,
          source: result.source,
          status: "ready",
          title: target.game.title,
        });
        process.stdout.write(`  ready: ${result.imagePath} (${result.source})\n`);
        continue;
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
    } catch (error) {
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

  const counts = report.reduce(
    (summary, entry) => {
      const status =
        typeof entry.status === "string" ? entry.status : "unknown";
      summary[status] = (summary[status] || 0) + 1;
      return summary;
    },
    {} as Record<string, number>,
  );
  process.stdout.write(
    `catalog artwork summary: uploaded=${counts.uploaded || 0}, ready=${
      counts.ready || 0
    }, skipped=${counts.skipped || 0}, failed=${counts.failed || 0}\n`,
  );

  const failed = report.filter((entry) => entry.status === "failed");
  if (failed.length > 0) {
    process.stderr.write("failed games:\n");
    for (const entry of failed) {
      process.stderr.write(`- ${entry.title}: ${entry.reason}\n`);
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
