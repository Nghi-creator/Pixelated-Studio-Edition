import { app } from "electron";
import fs from "fs";
import path from "path";

function hasWebIndex(dir: string) {
  return fs.existsSync(path.join(dir, "index.html"));
}

function firstAvailablePath(paths: string[]) {
  return paths.find(hasWebIndex) || paths[0];
}

function resolveWebDistDir() {
  if (process.env.PIXELATED_WEB_DIST_DIR) {
    return path.resolve(process.env.PIXELATED_WEB_DIST_DIR);
  }

  const bundledWebDistDir = process.resourcesPath
    ? path.join(process.resourcesPath, "web-dist")
    : path.resolve(__dirname, "../web-dist");
  const sourceWebDistDir = path.resolve(__dirname, "../../../apps/web/dist");
  const isPackaged = app?.isPackaged === true;
  const candidates = isPackaged
    ? [bundledWebDistDir, sourceWebDistDir]
    : [sourceWebDistDir, bundledWebDistDir];

  return firstAvailablePath(candidates);
}

export const engineRuntimeDir =
  process.env.PIXELATED_ENGINE_RUNTIME_DIR ||
  firstAvailablePath([
    process.resourcesPath
      ? path.join(process.resourcesPath, "engine-runtime")
      : path.resolve(__dirname, "../engine-runtime"),
    path.resolve(__dirname, "../../../engine/runtime"),
  ]);
export const backendApiUrl =
  process.env.PIXELATED_API_URL || "https://pixelated-api-services.onrender.com";
export const companionPort = Number(process.env.PIXELATED_COMPANION_PORT || 8090);
export const engineImage = process.env.PIXELATED_ENGINE_IMAGE || "pixelated-engine";
export const pullEngineImage =
  process.env.PIXELATED_ENGINE_PULL === "1" ||
  (engineImage !== "pixelated-engine" && process.env.PIXELATED_ENGINE_PULL !== "0");
export const buildFallback = process.env.PIXELATED_ENGINE_BUILD_FALLBACK !== "0";
export const webDistDir = resolveWebDistDir();
