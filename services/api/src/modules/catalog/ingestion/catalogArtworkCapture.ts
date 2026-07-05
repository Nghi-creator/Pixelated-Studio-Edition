import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

type CatalogStorageService = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (objectPath: string) => { data: { publicUrl: string } };
      upload: (
        objectPath: string,
        body: Buffer,
        options: { contentType: string; upsert: boolean },
      ) => Promise<{ error: Error | null }>;
    };
  };
};

export type CatalogArtworkBuild = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  id: string;
};

export type CatalogArtworkGame = {
  id: string;
  title: string;
};

export type CatalogArtworkTarget = {
  build: CatalogArtworkBuild;
  game: CatalogArtworkGame;
};

export type CatalogArtworkImage = {
  bytes: Buffer;
  extension?: string;
};

export type CatalogArtworkCommandInput = {
  artifactBytes: Buffer;
  artifactFilename: string | null;
  buildId: string;
  gameId: string;
  platformId: string;
  runtimeId: string;
  title: string;
};

export type ParsedCaptureCommand = {
  args: string[];
  file: string;
};

const GENERATED_COVER_MARKER = "/storage/v1/object/public/catalog_artifacts/covers/";

export function isGeneratedCatalogArtworkUrl(url: string | null | undefined) {
  return Boolean(url && url.includes(GENERATED_COVER_MARKER) && url.endsWith(".svg"));
}

export function contentTypeForArtworkExtension(extension: string) {
  const normalized = extension.toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg") return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  return "image/png";
}

export function parseCaptureCommand(command: string): ParsedCaptureCommand {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error("Capture command contains an unterminated quote.");
  if (current) parts.push(current);
  const [file, ...args] = parts;
  if (!file) throw new Error("Capture command cannot be empty.");
  return { args, file };
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

async function uploadObject(
  service: CatalogStorageService,
  objectPath: string,
  bytes: Buffer,
  contentType: string,
) {
  const bucket = service.storage.from("catalog_artifacts");
  const { error } = await bucket.upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error(`Failed to resolve public URL for ${objectPath}.`);
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}

export async function uploadGameplayArtwork(
  service: CatalogStorageService,
  target: CatalogArtworkTarget,
  image: CatalogArtworkImage,
) {
  const extension = image.extension?.startsWith(".")
    ? image.extension
    : `.${image.extension || "png"}`;
  const contentType = contentTypeForArtworkExtension(extension);
  const imageSha256 = crypto.createHash("sha256").update(image.bytes).digest("hex");
  const assetKey = sanitizeObjectSegment(
    `${target.build.artifact_sha256 || target.build.id}-${imageSha256.slice(0, 12)}`,
  );
  const rootPath = ["gameplay-captures", sanitizeObjectSegment(target.game.id)].join("/");
  const backdropObjectPath = `${rootPath}/${assetKey}-backdrop.svg`;
  const coverObjectPath = `${rootPath}/${assetKey}-cover${extension.toLowerCase()}`;
  const imageDataUri = createImageDataUri(image.bytes, contentType);
  const backdropSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600" viewBox="0 0 1600 600" role="img" aria-label="${escapeSvgText(target.game.title)} gameplay backdrop">
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#050505" stop-opacity="0.92"/>
      <stop offset="42%" stop-color="#050505" stop-opacity="0.46"/>
      <stop offset="100%" stop-color="#050505" stop-opacity="0.86"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="600" fill="#050505"/>
  <image href="${imageDataUri}" x="-80" y="-160" width="1760" height="920" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity="0.72"/>
  <rect width="1600" height="600" fill="url(#shade)"/>
  <image href="${imageDataUri}" x="820" y="60" width="640" height="480" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated;image-rendering:crisp-edges"/>
</svg>`;

  const backdrop = await uploadObject(
    service,
    backdropObjectPath,
    Buffer.from(backdropSvg),
    "image/svg+xml",
  );
  const cover = await uploadObject(
    service,
    coverObjectPath,
    image.bytes,
    contentType,
  );

  return {
    backdrop,
    cover,
  };
}

export async function uploadGameplayArtworkFromFile(
  service: CatalogStorageService,
  target: CatalogArtworkTarget,
  imagePath: string,
) {
  return uploadGameplayArtwork(service, target, {
    bytes: await fs.readFile(imagePath),
    extension: path.extname(imagePath) || ".png",
  });
}

export function captureGameplayArtworkWithCommand(
  command: string,
  input: CatalogArtworkCommandInput,
) {
  const timeoutMs = Number(
    process.env.CATALOG_ARTWORK_CAPTURE_TIMEOUT_MS || 125_000,
  );

  return new Promise<CatalogArtworkImage>((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), "pixelated-promotion-artwork-"))
      .then(async (tempDir) => {
        const artifactExtension =
          path.extname(input.artifactFilename || "").toLowerCase() || ".rom";
        const romPath = path.join(tempDir, `game${artifactExtension}`);
        const outputPath = path.join(tempDir, "capture.png");
        await fs.writeFile(romPath, input.artifactBytes);
        const parsedCommand = parseCaptureCommand(command);

        const child = spawn(parsedCommand.file, parsedCommand.args, {
          env: {
            ...process.env,
            PIXELATED_CAPTURE_ARTIFACT_FILENAME: input.artifactFilename || "",
            PIXELATED_CAPTURE_GAME_ID: input.gameId,
            PIXELATED_CAPTURE_GAME_TITLE: input.title,
            PIXELATED_CAPTURE_OUTPUT_PATH: outputPath,
            PIXELATED_CAPTURE_PLATFORM_ID: input.platformId,
            PIXELATED_CAPTURE_ROM_PATH: romPath,
            PIXELATED_CAPTURE_RUNTIME_ID: input.runtimeId,
          },
          stdio: "ignore",
        });

        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(
            new Error(
              `Capture command timed out after ${timeoutMs}ms for ${input.title}.`,
            ),
          );
        }, timeoutMs);

        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        child.on("exit", async (code, signal) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(
              new Error(
                `Capture command failed for ${input.title}: ${
                  signal ? `signal ${signal}` : `exit ${code}`
                }`,
              ),
            );
            return;
          }

          try {
            const bytes = await fs.readFile(outputPath);
            if (bytes.length < 16) {
              throw new Error(`Capture command produced an empty image for ${input.title}.`);
            }
            resolve({ bytes, extension: path.extname(outputPath) || ".png" });
          } catch (error) {
            reject(error);
          }
        });
      })
      .catch(reject);
  });
}
