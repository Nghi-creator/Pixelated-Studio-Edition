const path = require("path");

const engineRuntimeDir =
  process.env.PIXELATED_ENGINE_RUNTIME_DIR ||
  path.resolve(__dirname, "../../../engine/runtime");
const backendApiUrl =
  process.env.PIXELATED_API_URL || "https://pixelated-api-services.onrender.com";
const engineImage = process.env.PIXELATED_ENGINE_IMAGE || "pixelated-engine";
const pullEngineImage =
  process.env.PIXELATED_ENGINE_PULL === "1" ||
  (engineImage !== "pixelated-engine" && process.env.PIXELATED_ENGINE_PULL !== "0");
const buildFallback = process.env.PIXELATED_ENGINE_BUILD_FALLBACK !== "0";

module.exports = {
  backendApiUrl,
  buildFallback,
  engineImage,
  engineRuntimeDir,
  pullEngineImage,
};
