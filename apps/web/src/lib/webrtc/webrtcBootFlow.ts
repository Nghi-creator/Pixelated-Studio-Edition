import {
  loadEngineLaunchFailureMessage,
  stopActiveEngineSession,
} from "./engineContext";
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  STREAM_BOOT_READY_TIMEOUT_MS,
} from "./webrtcConfig";
import { createWebRTCRetryIdentity } from "./webrtcIdentity";
import { isRetryableBackendSessionConflict } from "./webrtcSessionErrors";
import {
  getErrorMessage,
  STREAM_BOOT_ERROR_MESSAGE,
} from "./streamErrors";
import { getResolvedBootTarget } from "./webrtcBootTarget";
import type {
  FailStream,
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "./webrtcLifecycleTypes";

export async function handleWebRTCSocketConnect({
  config,
  failStream,
  params,
  runtime,
}: {
  config: WebRTCSessionConfig;
  failStream: FailStream;
  params: UseWebRTCSessionLifecycleParams;
  runtime: WebRTCSessionRuntime;
}) {
  const connectGeneration = ++runtime.activeConnectGeneration;
  console.log("[WebRTC] Connected. Booting sequence initiated.");

  if (runtime.heartbeatIntervalId !== null) {
    window.clearInterval(runtime.heartbeatIntervalId);
  }
  runtime.heartbeatIntervalId = window.setInterval(() => {
    runtime.socket.emit("client-heartbeat");
  }, CLIENT_HEARTBEAT_INTERVAL_MS);

  runtime.socket.emit("join-session", {
    sessionId: params.sessionId,
    displayName: config.displayName,
    role: config.requestedRole,
    suppressReady: config.seamlessRestart && config.mode === "host",
  });

  if (config.mode !== "host") {
    return;
  }

  const startBootReadyTimer = () => {
    if (runtime.bootReadyTimeoutId !== null) {
      window.clearTimeout(runtime.bootReadyTimeoutId);
    }
    runtime.bootReadyTimeoutId = window.setTimeout(() => {
      runtime.bootReadyTimeoutId = null;
      loadEngineLaunchFailureMessage().then((diagnosticMessage) => {
        failStream(
          diagnosticMessage ||
            "The engine started the game but the video bridge did not become ready. Retry the stream; if this is a native Linux game, check the desktop runtime log for launch errors.",
        );
      });
    }, STREAM_BOOT_READY_TIMEOUT_MS);
  };

  if (config.seamlessRestart) {
    runtime.socket.emit("restart-stream", {
      sessionId: params.sessionId,
      iceServers: runtime.iceServersForSession,
      streamProfile: {
        bitrateKbps: config.activeStreamProfile.bitrateKbps,
        fps: config.activeStreamProfile.fps,
        id: config.activeStreamProfile.id,
      },
    });
    params.onResearchEvent?.("start_game_emitted", {
      restart: true,
      streamProfileId: config.activeStreamProfile.id,
    });
    startBootReadyTimer();
    return;
  }

  try {
    params.onResearchEvent?.("backend_session_requested", {
      gameId: params.gameId,
    });
    const bootTarget = await getResolvedBootTarget(
      runtime,
      params.gameId,
      params.sessionId,
    );
    params.onResearchEvent?.("backend_session_created", {
      mode: bootTarget.mode,
      runtimeId:
        "runtimeId" in bootTarget ? bootTarget.runtimeId || null : null,
    });
    if (connectGeneration !== runtime.activeConnectGeneration || !runtime.socket.connected) {
      params.onResearchEvent?.("engine_reconnect_waiting", {
        reason: "runtime_switch",
      });
      return;
    }
    params.onResearchEvent?.("engine_stop_stale_session_requested");
    await stopActiveEngineSession().catch((err) => {
      console.warn("[WebRTC] Could not pre-stop stale active session:", err);
    });
    if (connectGeneration !== runtime.activeConnectGeneration || !runtime.socket.connected) {
      params.onResearchEvent?.("engine_reconnect_waiting", {
        reason: "runtime_switch_after_stop",
      });
      return;
    }
    runtime.socket.emit("start-game", {
      sessionId: params.sessionId,
      iceServers: runtime.iceServersForSession,
      streamProfile: {
        bitrateKbps: config.activeStreamProfile.bitrateKbps,
        fps: config.activeStreamProfile.fps,
        id: config.activeStreamProfile.id,
      },
      ...bootTarget,
    });
    params.onResearchEvent?.("start_game_emitted", {
      mode: bootTarget.mode,
      runtimeId:
        "runtimeId" in bootTarget ? bootTarget.runtimeId || null : null,
      streamProfileId: config.activeStreamProfile.id,
    });
    startBootReadyTimer();
  } catch (err) {
    console.error("Failed to boot game:", err);
    if (
      isRetryableBackendSessionConflict(err) &&
      !params.options.sessionId &&
      params.sessionConflictAutoRetriesRemainingRef.current > 0
    ) {
      params.sessionConflictAutoRetriesRemainingRef.current -= 1;
      params.onResearchEvent?.("retry_started", {
        reason: "backend_session_conflict",
      });
      const identity = createWebRTCRetryIdentity(false);
      params.peerIdRef.current = identity.peerId;
      if (identity.sessionId) params.setSessionId(identity.sessionId);
      params.setRetryVersion((currentVersion) => currentVersion + 1);
      return;
    }
    failStream(getErrorMessage(err, STREAM_BOOT_ERROR_MESSAGE));
  }
}
