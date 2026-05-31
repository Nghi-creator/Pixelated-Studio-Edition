const path = require("path");
const fs = require("fs");
const { app } = require("electron");

function hasWebIndex(dir) {
  return fs.existsSync(path.join(dir, "index.html"));
}

function firstAvailablePath(paths) {
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

const engineRuntimeDir =
  process.env.PIXELATED_ENGINE_RUNTIME_DIR ||
  path.resolve(__dirname, "../../../engine/runtime");
const backendApiUrl =
  process.env.PIXELATED_API_URL || "https://pixelated-api-services.onrender.com";
const companionPort = Number(process.env.PIXELATED_COMPANION_PORT || 8090);
const engineImage = process.env.PIXELATED_ENGINE_IMAGE || "pixelated-engine";
const pullEngineImage =
  process.env.PIXELATED_ENGINE_PULL === "1" ||
  (engineImage !== "pixelated-engine" && process.env.PIXELATED_ENGINE_PULL !== "0");
const buildFallback = process.env.PIXELATED_ENGINE_BUILD_FALLBACK !== "0";
const webDistDir = resolveWebDistDir();

module.exports = {
  backendApiUrl,
  buildFallback,
  companionPort,
  engineImage,
  engineRuntimeDir,
  pullEngineImage,
  webDistDir,
};
