const crypto = require("crypto");
const { backendApiUrl, engineImage } = require("./config");
const {
  exec,
  execCommand,
  getSafeEnv,
  isSafeDockerImageRef,
  prepareEngineImage,
  quoteDockerEnvValue,
} = require("./docker");
const {
  getAdvertisedEngineUrls,
  getDockerPublishHost,
  normalizeExposureMode,
} = require("./exposure");
const { waitForEngineHealth } = require("./health");
const { emitEngineState, setCurrentEnginePhase } = require("./state");

let engineToken = null;

function buildDockerRunCommand({
  advertisedUrls,
  engineToken,
  exposureMode,
  publishHost,
}) {
  return `docker run -d --name pixelated-node -p ${publishHost}:8080:8080 -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_API_URL="${quoteDockerEnvValue(backendApiUrl)}" -e PIXELATED_ENGINE_TOKEN="${quoteDockerEnvValue(engineToken)}" -e PIXELATED_ENGINE_EXPOSURE_MODE="${exposureMode}" -e PIXELATED_ADVERTISED_URLS="${quoteDockerEnvValue(advertisedUrls.join(","))}" ${engineImage}`;
}

function rejectInvalidImage(event) {
  setCurrentEnginePhase("image");
  emitEngineState(event, "FAILED", "Invalid image reference");
  event.reply(
    "server-log",
    '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
  );
  event.reply("engine-stopped");
}

function createEngineLaunchContext(options = {}) {
  const exposureMode = normalizeExposureMode(options.exposureMode);
  const publishHost = getDockerPublishHost(exposureMode);
  const advertisedUrls = getAdvertisedEngineUrls(exposureMode);

  return {
    advertisedUrls,
    exposureMode,
    publishHost,
  };
}

function startContainer(event, safeEnv, launchContext) {
  emitEngineState(event, "STARTING_CONTAINER", `${launchContext.publishHost}:8080`);
  event.reply(
    "server-log",
    `Starting WebRTC Node in ${launchContext.exposureMode.toUpperCase()} mode...`,
  );

  return execCommand(
    buildDockerRunCommand({
      ...launchContext,
      engineToken,
    }),
    { env: safeEnv },
  );
}

function handleStartupFailure(event, safeEnv, startErr) {
  emitEngineState(event, "FAILED", startErr.message);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${startErr.message}</span>`,
  );
  exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
    event.reply("engine-stopped");
  });
}

function startEngine(event, options = {}) {
  if (!isSafeDockerImageRef(engineImage)) {
    rejectInvalidImage(event);
    return;
  }

  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  const launchContext = createEngineLaunchContext(options);

  engineToken = crypto.randomBytes(24).toString("base64url");
  event.reply("engine-token", engineToken);
  event.reply("engine-exposure", {
    advertisedUrls: launchContext.advertisedUrls,
    exposureMode: launchContext.exposureMode,
  });

  exec("docker info", { env: safeEnv }, (err) => {
    if (err) {
      emitEngineState(event, "FAILED", "Docker is not running");
      event.reply(
        "server-log",
        '<span class="text-red-500">ERROR: Docker Engine not detected or not running.</span>',
      );
      event.reply("engine-stopped");
      return;
    }

    event.reply("server-log", "Docker Engine found.");

    prepareEngineImage(event, safeEnv)
      .then(() => {
        event.reply("server-log", "Image ready. Preparing WebRTC Node...");
        emitEngineState(event, "REMOVING_STALE", "pixelated-node");

        return execCommand("docker rm -f pixelated-node", { env: safeEnv }).catch(
          () => undefined,
        );
      })
      .then(() => startContainer(event, safeEnv, launchContext))
      .then(() => {
        emitEngineState(event, "WAITING_HEALTH", "30 attempts · 1s interval");
        event.reply("server-log", "Waiting for engine health check...");
        return waitForEngineHealth();
      })
      .then(() => {
        emitEngineState(event, "READY", "http://127.0.0.1:8080/health");
        event.reply(
          "server-log",
          '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
        );
      })
      .catch((startErr) => handleStartupFailure(event, safeEnv, startErr));
  });
}

function stopEngine(event) {
  emitEngineState(event, "STOPPING");
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = getSafeEnv();

  exec("docker rm -f pixelated-node", { env: safeEnv }, (err) => {
    if (err) {
      event.reply(
        "server-log",
        '<span class="text-red-500">Warning: Could not gracefully stop node.</span>',
      );
    } else {
      event.reply("server-log", "Engine successfully terminated.");
    }
    emitEngineState(event, "STOPPED");
    event.reply("engine-stopped");
  });
}

function cleanupEngine() {
  const safeEnv = getSafeEnv();
  exec("docker rm -f pixelated-node", { env: safeEnv });
}

module.exports = {
  cleanupEngine,
  startEngine,
  stopEngine,
};
