import {
  engineEndpoint,
  getEngineControlUrl,
  getEngineUrl,
  getLocalCompanionControlUrl,
} from "../engine/engineConfig";
import { engineControlAuthHeaders } from "../engine/engineAuth";
import type { EngineRuntimeKind } from "./runtimeKind";
import type {
  EngineInputCapabilities,
  EngineShareContext,
} from "./types";
import { formatEngineLaunchFailure } from "./streamErrors";

const KEYBOARD_FALLBACK_PLAYER_COUNT = 2;
const VIRTUAL_GAMEPAD_PLAYER_COUNT = 4;

type EngineHealthPayload = {
  companionUrls?: string[];
  checks?: {
    gamepadBridge?: {
      failed?: boolean;
      fileExists?: boolean;
      ready?: boolean;
      uinputAvailable?: boolean;
    };
    runtime?: {
      lastLaunchFailure?: {
        exitCode?: number | null;
        label?: string;
        message?: string;
        occurredAt?: string;
        runtimeId?: string;
        sessionId?: string;
        signal?: string | null;
        stderrTail?: string;
        stdoutTail?: string;
      } | null;
    };
  };
  exposureMode?: "local" | "lan";
  runtimeKind?: "libretro" | "native_linux";
};

export const CHECKING_INPUT_CAPABILITIES: EngineInputCapabilities = {
  limitationReason:
    "Checking engine gamepad support before enabling P3/P4. Spectators can still join.",
  source: "checking",
  supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
};

function getInputCapabilitiesFromHealth(
  health: EngineHealthPayload,
): EngineInputCapabilities {
  const bridge = health.checks?.gamepadBridge;

  if (!bridge?.fileExists) {
    return {
      limitationReason:
        "P3/P4 are disabled because the virtual gamepad bridge is missing. Spectators can still join and watch.",
      source: "health",
      supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
    };
  }

  if (!bridge.uinputAvailable) {
    return {
      limitationReason:
        "P3/P4 are disabled because /dev/uinput is not available to the engine. P1/P2 use keyboard fallback; spectators can still join.",
      source: "health",
      supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
    };
  }

  if (bridge.failed) {
    return {
      limitationReason:
        "P3/P4 are disabled because the virtual gamepad bridge failed to start. P1/P2 remain playable and spectators can still join.",
      source: "health",
      supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
    };
  }

  return {
    limitationReason: null,
    source: "health",
    supportedPlayerCount: VIRTUAL_GAMEPAD_PLAYER_COUNT,
  };
}

export async function loadEngineInputCapabilities(): Promise<EngineInputCapabilities> {
  try {
    const response = await fetch(engineEndpoint("/health"));
    if (!response.ok) throw new Error("Engine health check failed.");
    const health = (await response.json()) as EngineHealthPayload;
    return getInputCapabilitiesFromHealth(health);
  } catch (err) {
    console.warn("[WebRTC] Could not load engine input capabilities:", err);
    return {
      limitationReason:
        "P3/P4 are disabled because engine health is unavailable. P1/P2 remain playable and spectators can still join.",
      source: "unavailable",
      supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
    };
  }
}

export async function loadEngineShareContext(): Promise<EngineShareContext> {
  try {
    const response = await fetch(engineEndpoint("/health"));
    const health = (await response.json()) as EngineHealthPayload;
    return {
      companionUrls: health.companionUrls || [],
      exposureMode: health.exposureMode || "unknown",
    };
  } catch (err) {
    console.warn("[WebRTC] Could not load engine share context:", err);
    return {
      companionUrls: [],
      exposureMode: "unknown",
    };
  }
}

export async function loadEngineRuntimeKind() {
  const response = await fetch(engineEndpoint("/health"));
  if (!response.ok) throw new Error("Engine health check failed.");
  const health = (await response.json()) as EngineHealthPayload;
  return health.runtimeKind || "libretro";
}

export async function loadEngineLaunchFailureMessage() {
  try {
    const response = await fetch(engineEndpoint("/health"), { cache: "no-store" });
    const health = (await response.json()) as EngineHealthPayload;
    return formatEngineLaunchFailure(health);
  } catch (err) {
    console.warn("[WebRTC] Could not load engine launch diagnostics:", err);
    return null;
  }
}

export async function requestEngineRuntimeSwitch(
  runtimeKind: EngineRuntimeKind,
) {
  const requestSwitch = (controlUrl: string) =>
    fetch(`${controlUrl}/runtime/switch`, {
      body: JSON.stringify({ runtimeKind }),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...engineControlAuthHeaders(),
      },
      method: "POST",
    });

  const primaryControlUrl = getEngineControlUrl();
  const fallbackControlUrl =
    primaryControlUrl === getEngineUrl()
      ? getLocalCompanionControlUrl(primaryControlUrl)
      : null;
  let response = await requestSwitch(primaryControlUrl).catch((err) => {
    if (!fallbackControlUrl) throw err;
    return requestSwitch(fallbackControlUrl);
  });

  if (
    fallbackControlUrl &&
    primaryControlUrl !== fallbackControlUrl &&
    [404, 405].includes(response.status)
  ) {
    response = await requestSwitch(fallbackControlUrl);
  }

  return parseRuntimeSwitchResponse(response);
}

export async function stopActiveEngineSession() {
  const requestStop = (controlUrl: string) =>
    fetch(`${controlUrl}/session/stop-active`, {
      cache: "no-store",
      headers: {
        ...engineControlAuthHeaders(),
      },
      method: "POST",
    });

  const primaryControlUrl = getEngineControlUrl();
  const fallbackControlUrl =
    primaryControlUrl === getEngineUrl()
      ? getLocalCompanionControlUrl(primaryControlUrl)
      : null;
  let response = await requestStop(primaryControlUrl).catch((err) => {
    if (!fallbackControlUrl) throw err;
    return requestStop(fallbackControlUrl);
  });

  if (
    fallbackControlUrl &&
    primaryControlUrl !== fallbackControlUrl &&
    [404, 405].includes(response.status)
  ) {
    response = await requestStop(fallbackControlUrl);
  }

  if (!response.ok) {
    throw new Error("Could not stop active engine session.");
  }
}

async function parseRuntimeSwitchResponse(response: Response) {
  if (response.status === 202) {
    return { status: "restarting" as const };
  }

  if (response.status === 200) {
    return { status: "unchanged" as const };
  }

  if (response.status === 409) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    return {
      error:
        typeof payload.error === "string"
          ? payload.error
          : "A game session is active on this desktop engine. Stop the current stream before switching runtimes.",
      status: "blocked" as const,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    code?: unknown;
    error?: unknown;
  };
  const error =
    typeof payload.error === "string"
      ? payload.error
      : "Pixelated Desktop could not switch runtimes automatically. Open the app from Pixelated Desktop or pair this browser with the local engine, then try again.";

  return {
    error:
      response.status === 401
        ? "Pixelated Desktop needs a fresh control pairing before it can switch runtimes. Open the web app from Pixelated Desktop again, then press Play."
        : error,
    status: "unavailable" as const,
  };
}
