import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamProfile } from "../../../../lib/engine/streamProfiles";
import {
  CHECKING_INPUT_CAPABILITIES,
} from "../../../../lib/webrtc/engine/engineContext";
import type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyParticipant,
  LobbyState,
  UseWebRTCOptions,
} from "../../../../lib/webrtc/types";
import { useEnginePairingVersion } from "./engine/useEnginePairingVersion";
import { useWebRTCLobbyControls } from "./controls/useWebRTCLobbyControls";
import { useWebRTCProfileRestart } from "./controls/useWebRTCProfileRestart";
import { useWebRTCRecoveryControls } from "./controls/useWebRTCRecoveryControls";
import { useWebRTCSessionLifecycle } from "./session/useWebRTCSessionLifecycle";
import { createWebRTCSessionId, type WebRTCStatus } from "../../../../lib/webrtc/session/webrtcSession";
import type { EngineSocket } from "../../../../lib/webrtc/transport/webrtcSocket";
import {
  INITIAL_WEBRTC_TELEMETRY,
  type WebRTCTelemetry,
} from "../../../../lib/webrtc/telemetry/webrtcTelemetry";

export type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyParticipant,
  LobbyRole,
  LobbyState,
  WebRTCMode,
} from "../../../../lib/webrtc/types";

export function useWebRTC(
  gameId: string,
  streamProfile: StreamProfile,
  options: UseWebRTCOptions = {},
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>(
    gameId ? "connecting" : "idle",
  );
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [localParticipant, setLocalParticipant] =
    useState<LobbyParticipant | null>(null);
  const [inputCapabilities, setInputCapabilities] =
    useState<EngineInputCapabilities>(CHECKING_INPUT_CAPABILITIES);
  const [shareContext, setShareContext] = useState<EngineShareContext>({
    companionUrls: [],
    exposureMode: "unknown",
  });
  const [telemetry, setTelemetry] = useState<WebRTCTelemetry>(
    INITIAL_WEBRTC_TELEMETRY,
  );
  const pairingVersion = useEnginePairingVersion();
  const [retryVersion, setRetryVersion] = useState(0);
  const [sessionId, setSessionId] = useState(
    () => options.sessionId || createWebRTCSessionId(),
  );
  const onResearchEvent = options.onResearchEvent;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const peerIdRef = useRef(createWebRTCSessionId());
  const sessionIdRef = useRef(sessionId);
  const socketRef = useRef<EngineSocket | null>(null);
  const localParticipantRef = useRef<LobbyParticipant | null>(null);
  const inputCapabilitiesRef = useRef(inputCapabilities);
  const shareContextRef = useRef(shareContext);
  const lastMetricSentAtRef = useRef(0);
  const metricsDisabledRef = useRef(false);
  const sessionConflictAutoRetriesRemainingRef = useRef(1);
  const {
    profileAutoRetriesRemainingRef,
    seamlessRestartRef,
    streamProfileRef,
  } = useWebRTCProfileRestart({
    peerIdRef,
    setRetryVersion,
    streamProfile,
  });

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    inputCapabilitiesRef.current = inputCapabilities;
  }, [inputCapabilities]);

  useEffect(() => {
    shareContextRef.current = shareContext;
  }, [shareContext]);

  useWebRTCSessionLifecycle({
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
  });

  const {
    reportBlackFrameStall,
    retry,
  } = useWebRTCRecoveryControls({
    lastMetricSentAtRef,
    metricsDisabledRef,
    onResearchEvent,
    options,
    peerIdRef,
    profileAutoRetriesRemainingRef,
    seamlessRestartRef,
    sessionConflictAutoRetriesRemainingRef,
    setRetryVersion,
    setSessionId,
    setStatus,
    setTelemetry,
  });
  const {
    kickParticipant,
    releasePlayerSlot,
    requestPlayerSlot,
  } = useWebRTCLobbyControls({
    inputCapabilitiesRef,
    sessionIdRef,
    setTelemetry,
    socketRef,
  });

  const stop = useCallback(() => {
    cleanupRef.current?.();
    setStatus("idle");
  }, []);

  return {
    kickParticipant,
    inputCapabilities,
    lobbyState,
    localParticipant,
    releasePlayerSlot,
    requestPlayerSlot,
    retry,
    reportBlackFrameStall,
    sessionId,
    shareContext,
    stream,
    status,
    stop,
    telemetry,
  };
}
