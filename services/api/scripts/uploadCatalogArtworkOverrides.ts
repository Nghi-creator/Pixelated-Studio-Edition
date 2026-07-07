import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { z } from "zod";
import { uploadGameplayArtworkFromFile } from "../src/modules/catalog/ingestion/catalogArtworkCapture.js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

type GameRow = {
  id: string;
  rom_filename: string | null;
  title: string;
};

const manifestEntrySchema = z
  .object({
    gameId: z.string().min(1).optional(),
    imagePath: z.string().min(1),
    romFilename: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    titleAliases: z.array(z.string().min(1)).default([]),
  })
  .refine(
    (entry) => Boolean(entry.gameId || entry.romFilename || entry.title),
    "Each entry needs at least one of gameId, romFilename, or title.",
  );

const manifestSchema = z.object({
  entries: z.array(manifestEntrySchema).min(1),
});

type ManifestEntry = z.infer<typeof manifestEntrySchema>;

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function printHelp() {
  process.stdout.write(`Usage:
  npm --prefix services/api run upload:catalog-artwork-overrides -- --manifest ./cover-overrides.json --dry-run
  npm --prefix services/api run upload:catalog-artwork-overrides -- --manifest ./cover-overrides.json --apply

Manifest shape:
  {
    "entries": [
      {
        "title": "xniq",
        "romFilename": "xniq-alpha.gba",
        "imagePath": "/absolute/or/relative/path/to/xniq.png"
      }
    ]
  }

Options:
  --apply              Upload cover/backdrop assets and update games.
  --dry-run            Resolve games and files without mutating Supabase.
  --manifest <path>    JSON file listing artwork overrides to apply.

Entries may identify a game by gameId, romFilename, title, or titleAliases.
Relative imagePath values are resolved from the manifest file directory.

Supabase writes require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
`);
}

async function loadManifest(manifestPath: string) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const raw = await fsp.readFile(resolvedManifestPath, "utf8");
  const parsed = manifestSchema.parse(JSON.parse(raw));
  const manifestDir = path.dirname(resolvedManifestPath);

  return parsed.entries.map((entry) => ({
    ...entry,
    imagePath: path.isAbsolute(entry.imagePath)
      ? entry.imagePath
      : path.resolve(manifestDir, entry.imagePath),
  }));
}

function findTargetGame(games: GameRow[], entry: ManifestEntry) {
  const requestedTitleKeys = [entry.title, ...entry.titleAliases]
    .filter(Boolean)
    .map((value) => normalizeTitle(String(value)));

  return games.find((game) => {
    if (entry.gameId && game.id === entry.gameId) return true;
    if (entry.romFilename && game.rom_filename === entry.romFilename) return true;
    const gameTitleKey = normalizeTitle(game.title);
    return (
      requestedTitleKeys.length > 0 && requestedTitleKeys.includes(gameTitleKey)
    );
  });
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    printHelp();
    return;
  }

  const apply = hasArg("--apply");
  const manifestPath = getArgValue("--manifest");
  if (!manifestPath) {
    throw new Error("--manifest is required.");
  }
  const entries = await loadManifest(manifestPath);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Put them in services/api/.env or export them before running.",
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: games, error } = await service
    .from("games")
    .select("id,title,rom_filename")
    .returns<GameRow[]>();
  if (error) throw error;

  for (const entry of entries) {
    const game = findTargetGame(games || [], entry);
    if (!game) {
      process.stderr.write(
        `missing game: ${entry.gameId || entry.romFilename || entry.title}\n`,
      );
      continue;
    }

    if (!fs.existsSync(entry.imagePath)) {
      process.stderr.write(`missing file for ${game.title}: ${entry.imagePath}\n`);
      continue;
    }

    process.stdout.write(`${apply ? "uploading" : "ready"}: ${game.title}\n`);
    if (!apply) {
      process.stdout.write(`  file: ${entry.imagePath}\n`);
      continue;
    }

    const artwork = await uploadGameplayArtworkFromFile(
      service,
      {
        build: {
          artifact_filename: game.rom_filename,
          artifact_sha256: null,
          id: `manual-cover-${game.id}`,
        },
        game: {
          id: game.id,
          title: game.title,
        },
      },
      entry.imagePath,
    );

    const { error: updateError } = await service
      .from("games")
      .update({
        backdrop_url: artwork.backdrop.publicUrl,
        cover_url: artwork.cover.publicUrl,
      })
      .eq("id", game.id);
    if (updateError) throw updateError;

    process.stdout.write(`  cover: ${artwork.cover.publicUrl}\n`);
    process.stdout.write(`  backdrop: ${artwork.backdrop.publicUrl}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
