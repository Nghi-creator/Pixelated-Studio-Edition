import { engineEndpoint } from "../engine/engineConfig";
import { engineAuthHeaders } from "../engine/engineAuth";
import type { EngineRuntimeKind } from "./runtimeKind";
import type {
  EngineInputCapabilities,
  EngineShareContext,
} from "./types";

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

export async function requestEngineRuntimeSwitch(
  runtimeKind: EngineRuntimeKind,
) {
  const response = await fetch(engineEndpoint("/runtime/switch"), {
    body: JSON.stringify({ runtimeKind }),
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...engineAuthHeaders(),
    },
    method: "POST",
  });

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

  return { status: "unavailable" as const };
}
