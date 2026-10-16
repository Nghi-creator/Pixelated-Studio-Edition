import crypto from "node:crypto";
import { sanitizeCatalogObjectSegment } from "../../domain/catalogObjectPath.js";
import { readArtworkImage } from "./catalogArtworkImage.js";
import type { CatalogArtworkImage } from "../domain/catalogCandidateTypes.js";
export type { CatalogArtworkImage } from "../domain/catalogCandidateTypes.js";
type CatalogStorageService = {
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (objectPath: string) => {
        data: {
          publicUrl: string;
        };
      };
      upload: (objectPath: string, body: Buffer, options: {
        contentType: string;
        upsert: boolean;
      }) => Promise<{
        error: Error | null;
      }>;
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
export type { CatalogArtworkCommandInput, ParsedCaptureCommand } from "./catalogArtworkCommand.js";
export { parseCaptureCommand, captureGameplayArtworkWithCommand } from "./catalogArtworkCommand.js";
const GENERATED_COVER_MARKER = "/storage/v1/object/public/catalog_artifacts/covers/";
export function isGeneratedCatalogArtworkUrl(url: string | null | undefined) {
  return Boolean(url && url.includes(GENERATED_COVER_MARKER) && url.endsWith(".svg"));
}
export function contentTypeForArtworkExtension(extension: string) {
  const normalized = extension.toLowerCase();
  if (normalized === ".jpg" || normalized === ".jpeg")
    return "image/jpeg";
  if (normalized === ".webp")
    return "image/webp";
  return "image/png";
}
const sanitizeObjectSegment = (value: string) => sanitizeCatalogObjectSegment(value, "artwork");
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
async function uploadObject(service: CatalogStorageService, objectPath: string, bytes: Buffer, contentType: string) {
  const bucket = service.storage.from("catalog_artifacts");
  const { error } = await bucket.upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error)
    throw error;
  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error(`Failed to resolve public URL for ${objectPath}.`);
  }
  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}
export async function uploadGameplayArtwork(service: CatalogStorageService, target: CatalogArtworkTarget, image: CatalogArtworkImage) {
  const extension = image.extension?.startsWith(".")
    ? image.extension
    : `.${image.extension || "png"}`;
  const contentType = contentTypeForArtworkExtension(extension);
  const imageSha256 = crypto.createHash("sha256").update(image.bytes).digest("hex");
  const assetKey = sanitizeObjectSegment(`${target.build.artifact_sha256 || target.build.id}-${imageSha256.slice(0, 12)}`);
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
  const backdrop = await uploadObject(service, backdropObjectPath, Buffer.from(backdropSvg), "image/svg+xml");
  const cover = await uploadObject(service, coverObjectPath, image.bytes, contentType);
  return {
    backdrop,
    cover,
  };
}
export async function uploadGameplayArtworkFromFile(service: CatalogStorageService, target: CatalogArtworkTarget, imagePath: string) {
  return uploadGameplayArtwork(service, target, {
    ...await readArtworkImage(imagePath),
  });
}
