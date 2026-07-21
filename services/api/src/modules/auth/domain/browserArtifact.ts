import type { SupabaseServiceLike } from "../services/backendSessions.js";
import {
  getBrowserCoreTarget,
  type BrowserCoreId,
  type BrowserSystemId,
} from "./browserCoreContract.js";

export const MAX_BROWSER_ARTIFACT_BYTES = 64 * 1024 * 1024;

export type BrowserEligibility = {
  coreId: BrowserCoreId | null;
  eligible: boolean;
  reason: string | null;
  systemId: BrowserSystemId | null;
};

type BrowserBuild = {
  artifact_filename: string | null;
  artifact_sha256?: string | null;
  artifact_size?: number | null;
  artifact_url: string | null;
  platform_id: string;
  runtime_kind: "libretro" | "native_linux";
};

export function getBrowserEligibility(build: BrowserBuild): BrowserEligibility {
  if (build.runtime_kind !== "libretro") {
    return { coreId: null, eligible: false, reason: "Native Linux builds require Studio Edition.", systemId: null };
  }
  const target = getBrowserCoreTarget(build.platform_id, build.artifact_filename);
  if (!target) {
    return { coreId: null, eligible: false, reason: "This build is not supported by an installed browser emulator core.", systemId: null };
  }
  if (!build.artifact_url) {
    return { coreId: null, eligible: false, reason: "The build has no browser-readable artifact URL.", systemId: target.systemId };
  }
  try {
    const artifactUrl = new URL(build.artifact_url);
    if (!/^\/storage\/v1\/object\/(?:public|sign)\/catalog_roms\//.test(artifactUrl.pathname)) {
      return { coreId: null, eligible: false, reason: "The ROM must be mirrored into private catalog storage before browser play.", systemId: target.systemId };
    }
  } catch {
    return { coreId: null, eligible: false, reason: "The approved artifact URL is invalid.", systemId: target.systemId };
  }
  if (!Number.isSafeInteger(build.artifact_size) || (build.artifact_size || 0) <= 0) {
    return { coreId: null, eligible: false, reason: "The build is missing a verified artifact size.", systemId: target.systemId };
  }
  if ((build.artifact_size || 0) > MAX_BROWSER_ARTIFACT_BYTES) {
    return { coreId: null, eligible: false, reason: "The artifact exceeds the 64 MB browser safety limit.", systemId: target.systemId };
  }
  if (!/^[a-f0-9]{64}$/i.test(build.artifact_sha256 || "")) {
    return { coreId: null, eligible: false, reason: "The build is missing a verified SHA-256 checksum.", systemId: target.systemId };
  }
  return { ...target, eligible: true, reason: null };
}

export function parseSupabaseStorageObjectUrl(value: string, supabaseUrl: string) {
  const artifactUrl = new URL(value);
  const projectUrl = new URL(supabaseUrl);
  if (artifactUrl.origin !== projectUrl.origin) {
    throw new Error("Catalog ROMs must be mirrored into this Supabase project.");
  }
  const match = artifactUrl.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Catalog ROM URL is not a Supabase Storage object URL.");
  }
  return { bucket: decodeURIComponent(match[1]), path: match[2].split("/").map(decodeURIComponent).join("/") };
}

export function isPrivateCatalogRomUrl(value: string) {
  try {
    return /^\/storage\/v1\/object\/(?:public|sign)\/catalog_roms\//.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export async function createSignedCatalogRomUrl({
  artifactUrl,
  expiresInSeconds,
  service,
  supabaseUrl,
}: {
  artifactUrl: string;
  expiresInSeconds: number;
  service: SupabaseServiceLike;
  supabaseUrl: string;
}) {
  const { bucket, path } = parseSupabaseStorageObjectUrl(artifactUrl, supabaseUrl);
  if (bucket !== "catalog_roms") {
    throw new Error("Catalog ROMs must use the private catalog_roms bucket.");
  }
  const { data, error } = await service.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw error || new Error("Supabase did not return a signed ROM URL.");
  return data.signedUrl;
}
