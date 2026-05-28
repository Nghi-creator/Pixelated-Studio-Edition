const path = require("path");

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
const webDistDir =
  process.env.PIXELATED_WEB_DIST_DIR ||
  path.resolve(__dirname, "../../../apps/web/dist");

module.exports = {
  backendApiUrl,
  buildFallback,
  companionPort,
  engineImage,
  engineRuntimeDir,
  pullEngineImage,
  webDistDir,
};
