import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

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

type CaptureResult =
  | {
      imagePath: string;
      source: "capture-command" | "local-artwork";
    }
  | {
      reason: string;
      source: "none";
    };

const GENERATED_COVER_MARKER = "/storage/v1/object/public/catalog_artifacts/covers/";
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
  --dry-run                List what would happen without mutating Supabase.
  --force                  Include games that already have non-generated artwork.
  --limit <n>              Process at most n games.
  --game-id <id>           Process one game id.
  --artwork-dir <dir>      Use existing PNG/JPG/WebP files before capture command.
  --capture-command <cmd>  Command that writes PIXELATED_CAPTURE_OUTPUT_PATH.

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

function isGeneratedCatalogArtworkUrl(url: string | null | undefined) {
  return Boolean(url && url.includes(GENERATED_COVER_MARKER) && url.endsWith(".svg"));
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

function wrapSvgTitle(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 16 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

async function fileExists(filePath: string) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
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
  const timeoutMs = Number(process.env.CATALOG_ARTWORK_CAPTURE_TIMEOUT_MS || 45_000);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
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
      shell: true,
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
  service: ReturnType<typeof createClient>,
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

function createCoverSvg(target: CaptureTarget, backdropUrl: string) {
  const titleLines = wrapSvgTitle(target.game.title);
  const titleText = titleLines
    .map(
      (line, index) =>
        `<tspan x="48" dy="${index === 0 ? 0 : 58}">${escapeSvgText(line)}</tspan>`,
    )
    .join("");
  const platform = escapeSvgText((target.build.platform_id || "game").toUpperCase());
  const title = escapeSvgText(target.game.title);
  const imageUrl = escapeSvgText(backdropUrl);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Generated gameplay cover for ${title}</desc>
  <defs>
    <linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#050505" stop-opacity="0.18"/>
      <stop offset="46%" stop-color="#14070D" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#050505" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="tint" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#6d3148" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#9b0048" stop-opacity="0.20"/>
    </linearGradient>
  </defs>
  <rect width="720" height="1080" fill="#050505"/>
  <image href="${imageUrl}" x="0" y="0" width="720" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="720" height="1080" fill="url(#tint)"/>
  <rect width="720" height="1080" fill="url(#fade)"/>
  <rect x="32" y="32" width="656" height="1016" rx="34" fill="none" stroke="#d8a4b5" stroke-opacity="0.58" stroke-width="3"/>
  <g transform="translate(48 746)">
    <rect x="0" y="-54" width="${Math.max(132, platform.length * 22)}" height="42" rx="21" fill="#5a263b" fill-opacity="0.92" stroke="#d8a4b5" stroke-opacity="0.55"/>
    <text x="24" y="-26" fill="#f3c4d4" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="5">${platform}</text>
    <text x="0" y="42" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="900" letter-spacing="-1">${titleText}</text>
  </g>
</svg>`;
}

async function uploadArtwork(
  service: ReturnType<typeof createClient>,
  target: CaptureTarget,
  imagePath: string,
) {
  const extension = path.extname(imagePath).toLowerCase() || ".png";
  const assetKey = sanitizeObjectSegment(target.build.artifact_sha256 || target.build.id);
  const rootPath = ["gameplay-captures", sanitizeObjectSegment(target.game.id)].join("/");
  const backdropObjectPath = `${rootPath}/${assetKey}-backdrop${extension}`;
  const coverObjectPath = `${rootPath}/${assetKey}-cover.svg`;

  const backdropBytes = await fsp.readFile(imagePath);
  const backdrop = await uploadObject(
    service,
    backdropObjectPath,
    backdropBytes,
    contentTypeFor(imagePath),
  );
  const coverSvg = createCoverSvg(target, backdrop.publicUrl);
  const cover = await uploadObject(
    service,
    coverObjectPath,
    Buffer.from(coverSvg),
    "image/svg+xml",
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
  service: ReturnType<typeof createClient>,
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

  const service = createClient(supabaseUrl, serviceRoleKey, {
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
  }

  if (hasArg("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
