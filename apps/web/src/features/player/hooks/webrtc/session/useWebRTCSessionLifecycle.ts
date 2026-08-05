import { useEffect } from "react";
import { ensureEngineToken } from "../../../../../lib/engine/engineAuth";
import { FALLBACK_ICE_SERVERS } from "../../../../../lib/webrtc/transport/webrtcConfig";
import { createEngineSocket } from "../../../../../lib/webrtc/transport/webrtcSocket";
import type {
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "../../../../../lib/webrtc/session/webrtcLifecycleTypes";
import { createFailStream } from "../../../../../lib/webrtc/session/webrtcSessionFailure";
import { initializeWebRTCPeerSession } from "../../../../../lib/webrtc/transport/webrtcPeerLifecycle";
import { bindWebRTCSocketEvents } from "../../../../../lib/webrtc/transport/webrtcSocketEvents";
import { cleanupWebRTCSession } from "../../../../../lib/webrtc/session/webrtcSessionCleanup";

export function useWebRTCSessionLifecycle(params: UseWebRTCSessionLifecycleParams) {
  const {
    cleanupRef,
    gameId,
    inputCapabilitiesRef,
    lastMetricSentAtRef,
    localParticipantRef,
    metricsDisabledRef,
    onResearchEvent,
    options,
    pairingVersion,
    pcRef,
    peerIdRef,
    profileAutoRetriesRemainingRef,
    retryVersion,
    seamlessRestartRef,
    sessionConflictAutoRetriesRemainingRef,
    sessionId,
    setInputCapabilities,
    setLobbyState,
    setLocalParticipant,
    setRetryVersion,
    setSessionId,
    setShareContext,
    setStatus,
    setStream,
    setTelemetry,
    shareContextRef,
    socketRef,
    streamProfileRef,
  } = params;

  useEffect(() => {
    if (!gameId) return;

    const optionsSnapshot = {
      displayName: options.displayName,
      mode: options.mode,
      onResearchEvent,
      requestedRole: options.requestedRole,
      sessionId: options.sessionId,
    };
    const mode = optionsSnapshot.mode || "host";
    const config: WebRTCSessionConfig = {
      activeStreamProfile: streamProfileRef.current,
      displayName:
        optionsSnapshot.displayName || (mode === "host" ? "Host" : "Guest"),
      mode,
      peerId: peerIdRef.current,
      requestedRole:
        optionsSnapshot.requestedRole ||
        (mode === "host" ? "host" : "spectator"),
      seamlessRestart: seamlessRestartRef.current,
    };
    seamlessRestartRef.current = false;

    const engineToken = ensureEngineToken();
    if (!engineToken) {
      queueMicrotask(() => {
        onResearchEvent?.("engine_error", {
          reason: "missing_engine_pairing",
        });
        setTelemetry((currentTelemetry) => ({
          ...currentTelemetry,
          lastEngineError:
            "Pair the local engine before starting a game stream.",
          lastUpdatedAt: Date.now(),
        }));
        setStatus("error");
      });
      return;
    }

    const socket = createEngineSocket(engineToken);
    socketRef.current = socket;
    const lifecycleParams: UseWebRTCSessionLifecycleParams = {
      cleanupRef,
      gameId,
      inputCapabilitiesRef,
      lastMetricSentAtRef,
      localParticipantRef,
      metricsDisabledRef,
      onResearchEvent,
      options: optionsSnapshot,
      pairingVersion,
      pcRef,
      peerIdRef,
      profileAutoRetriesRemainingRef,
      retryVersion,
      seamlessRestartRef,
      sessionConflictAutoRetriesRemainingRef,
      sessionId,
      setInputCapabilities,
      setLobbyState,
      setLocalParticipant,
      setRetryVersion,
      setSessionId,
      setShareContext,
      setStatus,
      setStream,
      setTelemetry,
      shareContextRef,
      socketRef,
      streamProfileRef,
    };
    const runtime: WebRTCSessionRuntime = {
      activeConnectGeneration: 0,
      automaticRecoveryQueued: false,
      bootReadyTimeoutId: null,
      bootTargetPromise: null,
      detachEngineInput: () => undefined,
      disconnectedTimeoutId: null,
      disposed: false,
      heartbeatIntervalId: null,
      iceServersForSession: FALLBACK_ICE_SERVERS,
      incomingStream: null,
      offerSent: false,
      pc: null,
      resolvedBootTarget: null,
      socket,
      stopTelemetry: () => undefined,
    };
    const failStream = createFailStream({
      config,
      params: lifecycleParams,
      runtime,
    });

    bindWebRTCSocketEvents({
      config,
      failStream,
      params: lifecycleParams,
      runtime,
    });
    void initializeWebRTCPeerSession({
      config,
      failStream,
      params: lifecycleParams,
      runtime,
    });

    const cleanup = () => {
      cleanupWebRTCSession({ config, params: lifecycleParams, runtime });
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;

    return () => {
      cleanup();
    };
  }, [
    cleanupRef,
    gameId,
    inputCapabilitiesRef,
    lastMetricSentAtRef,
    localParticipantRef,
    metricsDisabledRef,
    onResearchEvent,
    options.displayName,
    options.mode,
    options.requestedRole,
    options.sessionId,
    pairingVersion,
    pcRef,
    peerIdRef,
    profileAutoRetriesRemainingRef,
    retryVersion,
    seamlessRestartRef,
    sessionConflictAutoRetriesRemainingRef,
    sessionId,
    setInputCapabilities,
    setLobbyState,
    setLocalParticipant,
    setRetryVersion,
    setSessionId,
    setShareContext,
    setStatus,
    setStream,
    setTelemetry,
    shareContextRef,
    socketRef,
    streamProfileRef,
  ]);
}
