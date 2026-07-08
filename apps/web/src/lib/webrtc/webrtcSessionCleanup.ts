import { INITIAL_WEBRTC_TELEMETRY } from "./webrtcTelemetry";
import { endSyncedMultiplayerLobby } from "./webrtcLobbySync";
import type {
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "./webrtcLifecycleTypes";

const SOCKET_EVENTS = [
  "webrtc-answer",
  "webrtc-ice-candidate-backend",
  "connect",
  "connect_error",
  "engine-error",
  "lobby-kicked",
  "lobby-state",
  "python-ready",
] as const;

export function cleanupWebRTCSession({
  config,
  params,
  runtime,
}: {
  config: WebRTCSessionConfig;
  params: UseWebRTCSessionLifecycleParams;
  runtime: WebRTCSessionRuntime;
}) {
  runtime.disposed = true;
  const preserveActiveSession =
    config.seamlessRestart || params.seamlessRestartRef.current;
  runtime.stopTelemetry();
  runtime.detachEngineInput();
  if (runtime.disconnectedTimeoutId !== null) {
    window.clearTimeout(runtime.disconnectedTimeoutId);
  }
  if (runtime.heartbeatIntervalId !== null) {
    window.clearInterval(runtime.heartbeatIntervalId);
  }
  if (runtime.bootReadyTimeoutId !== null) {
    window.clearTimeout(runtime.bootReadyTimeoutId);
  }

  if (runtime.pc) {
    runtime.pc.close();
    if (params.pcRef.current === runtime.pc) params.pcRef.current = null;
  }
  runtime.socket.emit("webrtc-peer-disconnect", {
    peerId: config.peerId,
    sessionId: params.sessionId,
  });
  if (
    !preserveActiveSession &&
    params.localParticipantRef.current?.role === "host"
  ) {
    endSyncedMultiplayerLobby(params.sessionId);
    runtime.socket.emit("stop-session", { sessionId: params.sessionId });
  }
  runtime.socket.disconnect();
  params.socketRef.current = null;

  for (const eventName of SOCKET_EVENTS) {
    runtime.socket.off(eventName);
  }

  if (!preserveActiveSession) {
    params.setStream(null);
    params.setTelemetry(INITIAL_WEBRTC_TELEMETRY);
  }
}
