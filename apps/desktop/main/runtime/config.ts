import { app } from "electron";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type EngineRuntimeKind = "libretro" | "native_linux";

function hasWebIndex(dir: string) {
  return fs.existsSync(path.join(dir, "index.html"));
}

function hasEngineRuntime(dir: string) {
  return fs.existsSync(path.join(dir, "Dockerfile"));
}

function firstAvailablePath(paths: string[]) {
  return paths.find(hasWebIndex) || paths[0];
}

function firstAvailableEngineRuntimePath(paths: string[]) {
  return paths.find(hasEngineRuntime) || paths[0];
}

function resolveWebDistDir() {
  if (process.env.PIXELATED_WEB_DIST_DIR) {
    return path.resolve(process.env.PIXELATED_WEB_DIST_DIR);
  }

  const bundledWebDistDir = process.resourcesPath
    ? path.join(process.resourcesPath, "web-dist")
    : path.resolve(__dirname, "../../web-dist");
  const sourceWebDistDir = path.resolve(__dirname, "../../../../apps/web/dist");
  const isPackaged = app?.isPackaged === true;
  const candidates = isPackaged
    ? [bundledWebDistDir, sourceWebDistDir]
    : [sourceWebDistDir, bundledWebDistDir];

  return firstAvailablePath(candidates);
}

export const engineRuntimeDir =
  process.env.PIXELATED_ENGINE_RUNTIME_DIR ||
  firstAvailableEngineRuntimePath([
    process.resourcesPath
      ? path.join(process.resourcesPath, "engine-runtime")
      : path.resolve(__dirname, "../../engine-runtime"),
    path.resolve(__dirname, "../../../../engine/runtime"),
    path.resolve(__dirname, "../../../../../engine/runtime"),
  ]);

export function normalizeEngineRuntimeKind(value: unknown): EngineRuntimeKind {
  return value === "native_linux" ? "native_linux" : "libretro";
}

function readNativeRuntimeLock() {
  const lockPath = path.join(engineRuntimeDir, "native-runtime.lock.json");
  const bytes = fs.readFileSync(lockPath);
  const parsed = JSON.parse(bytes.toString("utf8")) as { runtimeId?: unknown };
  const runtimeId =
    typeof parsed.runtimeId === "string" && parsed.runtimeId
      ? parsed.runtimeId
      : "debian-native-v1";
  return {
    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    runtimeId,
  };
}

function resolveDefaultNativeEngineImage() {
  try {
    const lock = readNativeRuntimeLock();
    return `pixelated-engine-native:${lock.runtimeId}-${lock.hash.slice(0, 12)}`;
  } catch {
    return "pixelated-engine-native";
  }
}

export function shouldPullEngineImage({
  defaultImage,
  image,
  pullSetting,
}: {
  defaultImage: string;
  image: string;
  pullSetting?: string;
}) {
  return pullSetting === "1" || (image !== defaultImage && pullSetting !== "0");
}

export const engineRuntimeKind = normalizeEngineRuntimeKind(
  process.env.PIXELATED_ENGINE_RUNTIME_KIND,
);
export const defaultLibretroEngineImage = "pixelated-engine";
export const defaultNativeEngineImage = resolveDefaultNativeEngineImage();
export const defaultEngineImage =
  engineRuntimeKind === "native_linux"
    ? defaultNativeEngineImage
    : defaultLibretroEngineImage;
export const backendApiUrl =
  process.env.PIXELATED_API_URL || "https://pixelated-api-services.onrender.com";
export const hostedWebUrl =
  process.env.PIXELATED_WEB_URL || "https://pixelated-studio-edition.vercel.app";
export const engineAllowedOrigins =
  process.env.PIXELATED_ALLOWED_ORIGINS ||
  [
    "https://pixelated-studio-edition.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].join(",");
export const companionPort = Number(process.env.PIXELATED_COMPANION_PORT || 8090);
export const nativeEngineImage =
  process.env.PIXELATED_ENGINE_NATIVE_IMAGE || defaultNativeEngineImage;
export const engineImage =
  engineRuntimeKind === "native_linux"
    ? nativeEngineImage
    : process.env.PIXELATED_ENGINE_IMAGE || defaultLibretroEngineImage;
export const nativeRuntimeLock =
  engineRuntimeKind === "native_linux" ? readNativeRuntimeLock() : null;
export const pullEngineImage = shouldPullEngineImage({
  defaultImage: defaultEngineImage,
  image: engineImage,
  pullSetting: process.env.PIXELATED_ENGINE_PULL,
});
export const buildFallback = process.env.PIXELATED_ENGINE_BUILD_FALLBACK !== "0";
export const webDistDir = resolveWebDistDir();

export type EngineRuntimeConfig = {
  defaultEngineImage: string;
  engineImage: string;
  engineRuntimeKind: EngineRuntimeKind;
  nativeRuntimeLock: { hash: string; runtimeId: string } | null;
  pullEngineImage: boolean;
};

export function resolveEngineRuntimeConfig(
  runtimeKindInput: unknown = process.env.PIXELATED_ENGINE_RUNTIME_KIND,
): EngineRuntimeConfig {
  const resolvedRuntimeKind = normalizeEngineRuntimeKind(runtimeKindInput);
  const resolvedDefaultEngineImage =
    resolvedRuntimeKind === "native_linux"
      ? defaultNativeEngineImage
      : defaultLibretroEngineImage;
  const resolvedNativeEngineImage =
    process.env.PIXELATED_ENGINE_NATIVE_IMAGE || defaultNativeEngineImage;
  const resolvedEngineImage =
    resolvedRuntimeKind === "native_linux"
      ? resolvedNativeEngineImage
      : process.env.PIXELATED_ENGINE_IMAGE || defaultLibretroEngineImage;
  const resolvedNativeRuntimeLock =
    resolvedRuntimeKind === "native_linux" ? readNativeRuntimeLock() : null;

  return {
    defaultEngineImage: resolvedDefaultEngineImage,
    engineImage: resolvedEngineImage,
    engineRuntimeKind: resolvedRuntimeKind,
    nativeRuntimeLock: resolvedNativeRuntimeLock,
    pullEngineImage: shouldPullEngineImage({
      defaultImage: resolvedDefaultEngineImage,
      image: resolvedEngineImage,
      pullSetting: process.env.PIXELATED_ENGINE_PULL,
    }),
  };
}
