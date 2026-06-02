import crypto from "crypto";
import { app, type IpcMainEvent } from "electron";
import path from "path";
import {
  backendApiUrl,
  companionPort,
  engineImage,
  webDistDir,
} from "./config";
import {
  startCompanionServer,
  stopCompanionServer,
  type CompanionServerResult,
} from "./companionServer";
import {
  exec,
  execCommand,
  getSafeEnv,
  hasHostUinput,
  isSafeDockerImageRef,
  prepareEngineImage,
  quoteDockerEnvValue,
} from "./docker";
import {
  getAdvertisedEngineUrls,
  getAdvertisedCompanionUrls,
  getDockerPublishHost,
  getLanIpv4Addresses,
  normalizeExposureMode,
  type ExposureMode,
} from "./exposure";
import { waitForEngineHealth } from "./health";
import { emitEngineState, setCurrentEnginePhase } from "./state";

type StartEngineOptions = {
  exposureMode?: unknown;
};

type EngineLaunchContext = {
  advertisedUrls: string[];
  companionUrls: string[];
  deviceArgs: string;
  exposureMode: ExposureMode;
  inviteCode?: string;
  inviteExpiresAt?: number;
  publishHost: string;
};

type DockerRunOptions = EngineLaunchContext & {
  engineToken: string;
};

let engineToken: string | null = null;

const INVITE_CODE_TTL_MS = 10 * 60 * 1000;

function createInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function buildDockerRunCommand({
  advertisedUrls,
  deviceArgs = "",
  engineToken,
  exposureMode,
  publishHost,
}: DockerRunOptions) {
  return `docker run -d --name pixelated-node -p ${publishHost}:8080:8080 ${deviceArgs} -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_API_URL="${quoteDockerEnvValue(backendApiUrl)}" -e PIXELATED_ENGINE_TOKEN="${quoteDockerEnvValue(engineToken)}" -e PIXELATED_ENGINE_EXPOSURE_MODE="${exposureMode}" -e PIXELATED_ADVERTISED_URLS="${quoteDockerEnvValue(advertisedUrls.join(","))}" ${engineImage}`;
}

function rejectInvalidImage(event: IpcMainEvent) {
  setCurrentEnginePhase("image");
  emitEngineState(event, "FAILED", "Invalid image reference");
  event.reply(
    "server-log",
    '<span class="text-red-500">ERROR: Invalid PIXELATED_ENGINE_IMAGE value.</span>',
  );
  event.reply("engine-stopped");
}

function createEngineLaunchContext(options: StartEngineOptions = {}): EngineLaunchContext {
  const exposureMode = normalizeExposureMode(options.exposureMode);
  const publishHost = getDockerPublishHost(exposureMode);
  const advertisedUrls = getAdvertisedEngineUrls(exposureMode);
  const companionUrls = getAdvertisedCompanionUrls(exposureMode, companionPort);
  const deviceArgs = hasHostUinput() ? "--device /dev/uinput" : "";
  const inviteCode = exposureMode === "lan" ? createInviteCode() : undefined;
  const inviteExpiresAt =
    exposureMode === "lan" ? Date.now() + INVITE_CODE_TTL_MS : undefined;

  return {
    advertisedUrls,
    companionUrls,
    deviceArgs,
    exposureMode,
    inviteCode,
    inviteExpiresAt,
    publishHost,
  };
}

async function startLanCompanion(
  event: IpcMainEvent,
  launchContext: EngineLaunchContext,
) {
  if (launchContext.exposureMode !== "lan") {
    event.reply("engine-companion", {
      enabled: false,
      urls: [],
    });
    return;
  }

  if (!engineToken || !launchContext.inviteCode || !launchContext.inviteExpiresAt) {
    throw new Error("LAN invite code has not been initialized.");
  }

  try {
    const companion: CompanionServerResult = await startCompanionServer({
      certDir: path.join(app.getPath("userData"), "certificates"),
      engineToken,
      inviteCode: launchContext.inviteCode,
      inviteExpiresAt: launchContext.inviteExpiresAt,
      lanAddresses: getLanIpv4Addresses(),
      port: companionPort,
      webDistDir,
    });
    event.reply("engine-companion", {
      certPath: companion.certPath,
      enabled: true,
      inviteCode: launchContext.inviteCode,
      inviteExpiresAt: new Date(launchContext.inviteExpiresAt).toISOString(),
      urls: launchContext.companionUrls,
    });
    event.reply(
      "server-log",
      `LAN companion HTTPS server ready on port ${companion.port}.`,
    );
  } catch (err) {
    const message = getErrorMessage(err);
    event.reply("engine-companion", {
      enabled: false,
      error: message,
      urls: [],
    });
    event.reply(
      "server-log",
      `<span class="text-amber-300">Warning: LAN HTTPS companion could not start: ${message}</span>`,
    );
  }
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function startContainer(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  launchContext: EngineLaunchContext,
) {
  if (!engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

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

function handleStartupFailure(
  event: IpcMainEvent,
  safeEnv: NodeJS.ProcessEnv,
  startErr: unknown,
) {
  stopCompanionServer();
  const message = getErrorMessage(startErr);
  emitEngineState(event, "FAILED", message);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${message}</span>`,
  );
  exec("docker rm -f pixelated-node", { env: safeEnv }, () => {
    event.reply("engine-stopped");
  });
}

export function startEngine(event: IpcMainEvent, options: StartEngineOptions = {}) {
  if (!isSafeDockerImageRef(engineImage)) {
    rejectInvalidImage(event);
    return;
  }

  emitEngineState(event, "CHECKING_DOCKER");
  event.reply("server-log", "Checking Docker daemon...");
  const safeEnv = getSafeEnv();
  const launchContext = createEngineLaunchContext(options);

  engineToken = crypto.randomBytes(24).toString("base64url");
  stopCompanionServer();
  event.reply("engine-token", engineToken);
  event.reply("engine-exposure", {
    advertisedUrls: launchContext.advertisedUrls,
    companionUrls: launchContext.companionUrls,
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
        return startLanCompanion(event, launchContext).then(() => {
          event.reply(
            "server-log",
            '<span class="text-green-500">SUCCESS: PIXELATED Engine healthy on Port 8080.</span>',
          );
        });
      })
      .catch((startErr) => handleStartupFailure(event, safeEnv, startErr));
  });
}

export function stopEngine(event: IpcMainEvent) {
  emitEngineState(event, "STOPPING");
  event.reply("server-log", "Initiating shutdown sequence...");
  const safeEnv = getSafeEnv();
  stopCompanionServer();

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

export function cleanupEngine() {
  const safeEnv = getSafeEnv();
  stopCompanionServer();
  exec("docker rm -f pixelated-node", { env: safeEnv });
}
