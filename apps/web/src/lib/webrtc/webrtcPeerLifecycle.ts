import {
  CHECKING_INPUT_CAPABILITIES,
  loadEngineInputCapabilities,
  loadEngineShareContext,
} from "./engineContext";
import {
  DISCONNECTED_GRACE_MS,
  loadIceServers,
  STREAM_METRIC_SEND_INTERVAL_MS,
} from "./webrtcConfig";
import { publishStreamMetric } from "./webrtcMetricPublisher";
import { createEnginePeerConnection } from "./webrtcPeer";
import { INITIAL_WEBRTC_TELEMETRY, startWebRTCTelemetry } from "./webrtcTelemetry";
import type {
  FailStream,
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "./webrtcLifecycleTypes";

export async function initializeWebRTCPeerSession({
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
  if (config.seamlessRestart) {
    params.setStatus((currentStatus) =>
      currentStatus === "playing" ? "playing" : "connecting",
    );
    params.setTelemetry((currentTelemetry) => ({
      ...currentTelemetry,
      lastEngineError: null,
    }));
  } else {
    params.setStatus("connecting");
    params.setStream(null);
    params.setLobbyState(null);
    params.setLocalParticipant(null);
    params.localParticipantRef.current = null;
    params.setInputCapabilities(CHECKING_INPUT_CAPABILITIES);
    params.setShareContext({
      companionUrls: [],
      exposureMode: "unknown",
    });
    params.setTelemetry(INITIAL_WEBRTC_TELEMETRY);
  }
  params.lastMetricSentAtRef.current = 0;
  params.metricsDisabledRef.current = false;

  const [nextIceServers, nextInputCapabilities, nextShareContext] =
    await Promise.all([
      loadIceServers(),
      loadEngineInputCapabilities(),
      loadEngineShareContext(),
    ]);
  if (runtime.disposed) return;
  runtime.iceServersForSession = nextIceServers;
  params.inputCapabilitiesRef.current = nextInputCapabilities;
  params.shareContextRef.current = nextShareContext;
  params.setInputCapabilities(nextInputCapabilities);
  params.setShareContext(nextShareContext);

  runtime.pc = createEnginePeerConnection({
    iceServers: runtime.iceServersForSession,
    peerId: config.peerId,
    socket: runtime.socket,
    sessionId: params.sessionId,
    onTrack: (track) => {
      params.onResearchEvent?.("remote_track_received", {
        kind: track.kind,
      });
      runtime.incomingStream ||= new MediaStream();
      runtime.incomingStream.addTrack(track);
      params.setStream(runtime.incomingStream);
      params.profileAutoRetriesRemainingRef.current = 0;
      params.sessionConflictAutoRetriesRemainingRef.current = 1;
      params.onResearchEvent?.("stream_playing", {
        trackKind: track.kind,
      });
      params.setStatus("playing");
    },
  });
  params.pcRef.current = runtime.pc;
  let peerWasDisconnected = false;

  const handlePeerStateChange = () => {
    if (!runtime.pc) return;
    const { connectionState, iceConnectionState } = runtime.pc;

    if (connectionState === "failed" || iceConnectionState === "failed") {
      params.onResearchEvent?.("connection_failed", {
        connectionState,
        iceConnectionState,
      });
      if (runtime.disconnectedTimeoutId !== null) {
        window.clearTimeout(runtime.disconnectedTimeoutId);
        runtime.disconnectedTimeoutId = null;
      }
      failStream(
        "WebRTC connection failed. Check that the desktop engine is running, then retry the stream.",
      );
      return;
    }

    if (
      connectionState === "disconnected" ||
      iceConnectionState === "disconnected"
    ) {
      if (runtime.disconnectedTimeoutId !== null) return;
      peerWasDisconnected = true;
      params.onResearchEvent?.("connection_disconnected", {
        connectionState,
        iceConnectionState,
      });
      runtime.disconnectedTimeoutId = window.setTimeout(() => {
        runtime.disconnectedTimeoutId = null;
        failStream(
          "WebRTC disconnected for too long. Retry once the local engine is reachable.",
        );
      }, DISCONNECTED_GRACE_MS);
      return;
    }

    if (runtime.disconnectedTimeoutId !== null) {
      window.clearTimeout(runtime.disconnectedTimeoutId);
      runtime.disconnectedTimeoutId = null;
    }
    if (
      peerWasDisconnected &&
      (connectionState === "connected" ||
        iceConnectionState === "connected" ||
        iceConnectionState === "completed")
    ) {
      peerWasDisconnected = false;
      params.onResearchEvent?.("connection_recovered", {
        connectionState,
        iceConnectionState,
      });
    }
  };

  runtime.pc.addEventListener("connectionstatechange", handlePeerStateChange);
  runtime.pc.addEventListener("iceconnectionstatechange", handlePeerStateChange);

  runtime.stopTelemetry = startWebRTCTelemetry(runtime.pc, (nextTelemetry) => {
    params.setTelemetry((currentTelemetry) => ({
      ...currentTelemetry,
      ...nextTelemetry,
    }));

    publishStreamMetric({
      lastMetricSentAtRef: params.lastMetricSentAtRef,
      metric: nextTelemetry,
      metricsDisabledRef: params.metricsDisabledRef,
      sendIntervalMs: STREAM_METRIC_SEND_INTERVAL_MS,
      sessionId: params.sessionId,
    });
  });

  runtime.socket.connect();
}
