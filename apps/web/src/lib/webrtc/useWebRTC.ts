import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  ensureEngineToken,
} from "../engine/engineAuth";
import { attachEngineInput } from "./webrtcInput";
import {
  createAndSendOffer,
  createEnginePeerConnection,
} from "./webrtcPeer";
import {
  createWebRTCSessionId,
  resolveGameBootTarget,
  type WebRTCStatus,
} from "./webrtcSession";
import { isRetryableBackendSessionConflict } from "./webrtcSessionErrors";
import {
  createWebRTCProfileRestartIdentity,
  createWebRTCRetryIdentity,
} from "./webrtcIdentity";
import {
  INITIAL_WEBRTC_TELEMETRY,
  startWebRTCTelemetry,
  type WebRTCTelemetry,
} from "./webrtcTelemetry";
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  DISCONNECTED_GRACE_MS,
  FALLBACK_ICE_SERVERS,
  loadIceServers,
  STREAM_BOOT_READY_TIMEOUT_MS,
  STREAM_METRIC_SEND_INTERVAL_MS,
} from "./webrtcConfig";
import { publishStreamMetric } from "./webrtcMetricPublisher";
import type { StreamProfile } from "../engine/streamProfiles";
import {
  CHECKING_INPUT_CAPABILITIES,
  loadEngineInputCapabilities,
  loadEngineLaunchFailureMessage,
  loadEngineShareContext,
  stopActiveEngineSession,
} from "./engineContext";
import {
  endSyncedMultiplayerLobby,
  syncMultiplayerLobby,
} from "./webrtcLobbySync";
import { createEngineSocket, type EngineSocket } from "./webrtcSocket";
import {
  getErrorMessage,
  STREAM_BOOT_ERROR_MESSAGE,
  STREAM_OFFER_ERROR_MESSAGE,
  STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE,
} from "./streamErrors";
import type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyParticipant,
  LobbyState,
  UseWebRTCOptions,
} from "./types";

const BLACK_FRAME_STALL_MESSAGE =
  "The stream connected, but the video stayed black. Retry the stream; if this only happens on cellular data, configure a TURN relay or use Wi-Fi.";

export type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyParticipant,
  LobbyRole,
  LobbyState,
  WebRTCMode,
} from "./types";

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
  const [pairingVersion, setPairingVersion] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [sessionId, setSessionId] = useState(
    () => options.sessionId || createWebRTCSessionId(),
  );
  const onResearchEvent = options.onResearchEvent;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerIdRef = useRef(createWebRTCSessionId());
  const sessionIdRef = useRef(sessionId);
  const socketRef = useRef<EngineSocket | null>(null);
  const localParticipantRef = useRef<LobbyParticipant | null>(null);
  const inputCapabilitiesRef = useRef(inputCapabilities);
  const shareContextRef = useRef(shareContext);
  const lastMetricSentAtRef = useRef(0);
  const metricsDisabledRef = useRef(false);
  const streamProfileRef = useRef(streamProfile);
  const appliedStreamProfileIdRef = useRef(streamProfile.id);
  const seamlessRestartRef = useRef(false);
  const profileAutoRetriesRemainingRef = useRef(0);
  const sessionConflictAutoRetriesRemainingRef = useRef(1);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    inputCapabilitiesRef.current = inputCapabilities;
  }, [inputCapabilities]);

  useEffect(() => {
    shareContextRef.current = shareContext;
  }, [shareContext]);

  useEffect(() => {
    const handlePairingChange = () =>
      setPairingVersion((currentVersion) => currentVersion + 1);

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
  }, []);

  useEffect(() => {
    streamProfileRef.current = streamProfile;
    if (appliedStreamProfileIdRef.current === streamProfile.id) return;

    appliedStreamProfileIdRef.current = streamProfile.id;
    const identity = createWebRTCProfileRestartIdentity();
    peerIdRef.current = identity.peerId;
    seamlessRestartRef.current = true;
    profileAutoRetriesRemainingRef.current = 1;
    setRetryVersion((currentVersion) => currentVersion + 1);
  }, [streamProfile]);

  useEffect(() => {
    if (!gameId) return;

    const activeStreamProfile = streamProfileRef.current;
    const seamlessRestart = seamlessRestartRef.current;
    seamlessRestartRef.current = false;
    const peerId = peerIdRef.current;
    const mode = options.mode || "host";
    const requestedRole =
      options.requestedRole || (mode === "host" ? "host" : "spectator");
    const displayName =
      options.displayName || (mode === "host" ? "Host" : "Guest");
    const recordResearchEvent = onResearchEvent;
    const engineToken = ensureEngineToken();

    if (!engineToken) {
      queueMicrotask(() => {
        recordResearchEvent?.("engine_error", {
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
    let pc: RTCPeerConnection | null = null;
    let stopTelemetry: () => void = () => undefined;
    let detachEngineInput: () => void = () => undefined;
    let disconnectedTimeoutId: number | null = null;
    let heartbeatIntervalId: number | null = null;
    let bootReadyTimeoutId: number | null = null;
    let disposed = false;
    let automaticRecoveryQueued = false;
    let offerSent = false;
    let incomingStream: MediaStream | null = null;
    let iceServersForSession: RTCIceServer[] = FALLBACK_ICE_SERVERS;

    const failStream = (message: string) => {
      if (disposed) return;
      if (bootReadyTimeoutId !== null) {
        window.clearTimeout(bootReadyTimeoutId);
        bootReadyTimeoutId = null;
      }
      recordResearchEvent?.("engine_error", { message });
      if (
        seamlessRestart &&
        !automaticRecoveryQueued &&
        profileAutoRetriesRemainingRef.current > 0
      ) {
        automaticRecoveryQueued = true;
        profileAutoRetriesRemainingRef.current -= 1;
        const identity = createWebRTCProfileRestartIdentity();
        peerIdRef.current = identity.peerId;
        seamlessRestartRef.current = true;
        setRetryVersion((currentVersion) => currentVersion + 1);
        return;
      }

      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError: message,
        lastUpdatedAt: Date.now(),
      }));
      setStatus("error");
    };

    const initialize = async () => {
      if (seamlessRestart) {
        setStatus((currentStatus) =>
          currentStatus === "playing" ? "playing" : "connecting",
        );
        setTelemetry((currentTelemetry) => ({
          ...currentTelemetry,
          lastEngineError: null,
        }));
      } else {
        setStatus("connecting");
        setStream(null);
        setLobbyState(null);
        setLocalParticipant(null);
        localParticipantRef.current = null;
        setInputCapabilities(CHECKING_INPUT_CAPABILITIES);
        setShareContext({
          companionUrls: [],
          exposureMode: "unknown",
        });
        setTelemetry(INITIAL_WEBRTC_TELEMETRY);
      }
      lastMetricSentAtRef.current = 0;
      metricsDisabledRef.current = false;

      const [nextIceServers, nextInputCapabilities, nextShareContext] =
        await Promise.all([
          loadIceServers(),
          loadEngineInputCapabilities(),
          loadEngineShareContext(),
        ]);
      if (disposed) return;
      iceServersForSession = nextIceServers;
      inputCapabilitiesRef.current = nextInputCapabilities;
      shareContextRef.current = nextShareContext;
      setInputCapabilities(nextInputCapabilities);
      setShareContext(nextShareContext);

      pc = createEnginePeerConnection({
        iceServers: iceServersForSession,
        peerId,
        socket,
        sessionId,
        onTrack: (track) => {
          recordResearchEvent?.("remote_track_received", {
            kind: track.kind,
          });
          incomingStream ||= new MediaStream();
          incomingStream.addTrack(track);
          setStream(incomingStream);
          profileAutoRetriesRemainingRef.current = 0;
          sessionConflictAutoRetriesRemainingRef.current = 1;
          recordResearchEvent?.("stream_playing", {
            trackKind: track.kind,
          });
          setStatus("playing");
        },
      });
      pcRef.current = pc;
      let peerWasDisconnected = false;

      const handlePeerStateChange = () => {
        if (!pc) return;
        const { connectionState, iceConnectionState } = pc;

        if (connectionState === "failed" || iceConnectionState === "failed") {
          recordResearchEvent?.("connection_failed", {
            connectionState,
            iceConnectionState,
          });
          if (disconnectedTimeoutId !== null) {
            window.clearTimeout(disconnectedTimeoutId);
            disconnectedTimeoutId = null;
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
          if (disconnectedTimeoutId !== null) return;
          peerWasDisconnected = true;
          recordResearchEvent?.("connection_disconnected", {
            connectionState,
            iceConnectionState,
          });
          disconnectedTimeoutId = window.setTimeout(() => {
            disconnectedTimeoutId = null;
            failStream(
              "WebRTC disconnected for too long. Retry once the local engine is reachable.",
            );
          }, DISCONNECTED_GRACE_MS);
          return;
        }

        if (disconnectedTimeoutId !== null) {
          window.clearTimeout(disconnectedTimeoutId);
          disconnectedTimeoutId = null;
        }
        if (
          peerWasDisconnected &&
          (connectionState === "connected" ||
            iceConnectionState === "connected" ||
            iceConnectionState === "completed")
        ) {
          peerWasDisconnected = false;
          recordResearchEvent?.("connection_recovered", {
            connectionState,
            iceConnectionState,
          });
        }
      };

      pc.addEventListener("connectionstatechange", handlePeerStateChange);
      pc.addEventListener("iceconnectionstatechange", handlePeerStateChange);

      stopTelemetry = startWebRTCTelemetry(pc, (nextTelemetry) => {
        setTelemetry((currentTelemetry) => ({
          ...currentTelemetry,
          ...nextTelemetry,
        }));

        publishStreamMetric({
          lastMetricSentAtRef,
          metric: nextTelemetry,
          metricsDisabledRef,
          sendIntervalMs: STREAM_METRIC_SEND_INTERVAL_MS,
          sessionId,
        });
      });

      socket.connect();
    };

    socket.on(
      "webrtc-answer",
      (answer: RTCSessionDescriptionInit & { peerId?: string }) => {
        if (answer.peerId !== peerId) {
          console.warn("[WebRTC] Ignoring answer without matching peer id.");
          return;
        }

        if (!pc || pc.signalingState !== "have-local-offer") {
          console.warn(
            `[WebRTC] Ignoring answer for peer ${peerId} while signalingState is ${pc?.signalingState || "closed"}.`,
          );
          return;
        }

        recordResearchEvent?.("answer_received", {
          peerId,
        });
        pc
          .setRemoteDescription(new RTCSessionDescription(answer))
          .catch((err) => {
            console.error("[WebRTC] Failed to apply answer:", err);
            failStream(
              getErrorMessage(err, STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE),
            );
          });
      },
    );

    socket.on(
      "webrtc-ice-candidate-backend",
      (candidate: RTCIceCandidateInit & { peerId?: string }) => {
        if (candidate.peerId !== peerId) return;
        pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.warn("[WebRTC] Failed to add ICE candidate:", err);
        });
      },
    );

    socket.on("connect_error", (err) => {
      console.error("[WebRTC] Engine connection failed:", err.message);
      recordResearchEvent?.("engine_error", {
        message: err.message,
        source: "connect_error",
      });
      if (err.message === "Invalid engine pairing token") {
        clearEngineToken();
        failStream(
          "The saved desktop pairing token was rejected. Pair the local engine again, then retry.",
        );
        return;
      }
      failStream(
        "Could not reach the local engine. Make sure the desktop app is running, then retry.",
      );
    });

    socket.on("engine-error", (payload: { code?: string; message?: string }) => {
      console.error("[WebRTC] Engine error:", payload?.message);
      recordResearchEvent?.("engine_error", {
        code: payload?.code || null,
        message: payload?.message || null,
        source: "engine-error",
      });
      if (payload?.code === "engine_access_revoked") {
        clearEngineToken();
      }
      failStream(payload?.message || "Engine error");
    });

    socket.on("connect", async () => {
      console.log("[WebRTC] Connected. Booting sequence initiated.");

      if (heartbeatIntervalId !== null) window.clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = window.setInterval(() => {
        socket.emit("client-heartbeat");
      }, CLIENT_HEARTBEAT_INTERVAL_MS);

      socket.emit("join-session", {
        sessionId,
        displayName,
        role: requestedRole,
        suppressReady: seamlessRestart && mode === "host",
      });

      if (mode !== "host") {
        return;
      }

      const startBootReadyTimer = () => {
        if (bootReadyTimeoutId !== null) {
          window.clearTimeout(bootReadyTimeoutId);
        }
        bootReadyTimeoutId = window.setTimeout(() => {
          bootReadyTimeoutId = null;
          loadEngineLaunchFailureMessage().then((diagnosticMessage) => {
            failStream(
              diagnosticMessage ||
                "The engine started the game but the video bridge did not become ready. Retry the stream; if this is a native Linux game, check the desktop runtime log for launch errors.",
            );
          });
        }, STREAM_BOOT_READY_TIMEOUT_MS);
      };

      if (seamlessRestart) {
        socket.emit("restart-stream", {
          sessionId,
          iceServers: iceServersForSession,
          streamProfile: {
            bitrateKbps: activeStreamProfile.bitrateKbps,
            fps: activeStreamProfile.fps,
            id: activeStreamProfile.id,
          },
        });
        recordResearchEvent?.("start_game_emitted", {
          restart: true,
          streamProfileId: activeStreamProfile.id,
        });
        startBootReadyTimer();
        return;
      }

      try {
        recordResearchEvent?.("backend_session_requested", {
          gameId,
        });
        const bootTarget = await resolveGameBootTarget(gameId, sessionId);
        recordResearchEvent?.("backend_session_created", {
          mode: bootTarget.mode,
          runtimeId:
            "runtimeId" in bootTarget ? bootTarget.runtimeId || null : null,
        });
        recordResearchEvent?.("engine_stop_stale_session_requested");
        await stopActiveEngineSession().catch((err) => {
          console.warn("[WebRTC] Could not pre-stop stale active session:", err);
        });
        socket.emit("start-game", {
          sessionId,
          iceServers: iceServersForSession,
          streamProfile: {
            bitrateKbps: activeStreamProfile.bitrateKbps,
            fps: activeStreamProfile.fps,
            id: activeStreamProfile.id,
          },
          ...bootTarget,
        });
        recordResearchEvent?.("start_game_emitted", {
          mode: bootTarget.mode,
          runtimeId:
            "runtimeId" in bootTarget ? bootTarget.runtimeId || null : null,
          streamProfileId: activeStreamProfile.id,
        });
        startBootReadyTimer();
      } catch (err) {
        console.error("Failed to boot game:", err);
        if (
          isRetryableBackendSessionConflict(err) &&
          !options.sessionId &&
          sessionConflictAutoRetriesRemainingRef.current > 0
        ) {
          sessionConflictAutoRetriesRemainingRef.current -= 1;
          recordResearchEvent?.("retry_started", {
            reason: "backend_session_conflict",
          });
          const identity = createWebRTCRetryIdentity(false);
          peerIdRef.current = identity.peerId;
          if (identity.sessionId) setSessionId(identity.sessionId);
          setRetryVersion((currentVersion) => currentVersion + 1);
          return;
        }
        failStream(getErrorMessage(err, STREAM_BOOT_ERROR_MESSAGE));
      }
    });

    socket.on("lobby-state", (nextLobbyState: LobbyState) => {
      const participant =
        nextLobbyState.participants.find(
          (entry) => entry.socketId === socket.id,
        ) || null;
      setLobbyState(nextLobbyState);
      setLocalParticipant(participant);
      localParticipantRef.current = participant;

      detachEngineInput();
      if (participant?.playerIndex) {
        detachEngineInput = attachEngineInput(
          socket,
          sessionId,
          participant.playerIndex,
        );
      }

      if (participant?.role === "host") {
        syncMultiplayerLobby({
          gameId,
          inputCapabilities: inputCapabilitiesRef.current,
          lobbyState: nextLobbyState,
          sessionId,
          shareContext: shareContextRef.current,
        });
      }
    });

    socket.on("lobby-kicked", () => {
      failStream("The host removed you from the lobby.");
    });

    socket.on("python-ready", async () => {
      recordResearchEvent?.("python_ready");
      if (bootReadyTimeoutId !== null) {
        window.clearTimeout(bootReadyTimeoutId);
        bootReadyTimeoutId = null;
      }
      console.log("[WebRTC] Python is awake! Generating and sending Offer...");
      loadEngineInputCapabilities().then((nextInputCapabilities) => {
        if (!disposed) {
          inputCapabilitiesRef.current = nextInputCapabilities;
          setInputCapabilities(nextInputCapabilities);
        }
      });
      loadEngineShareContext().then((nextShareContext) => {
        if (!disposed) {
          shareContextRef.current = nextShareContext;
          setShareContext(nextShareContext);
        }
      });
      if (pc) {
        if (offerSent) {
          console.warn("[WebRTC] Ignoring duplicate python-ready for active peer.");
          return;
        }
        if (pc.signalingState !== "stable") {
          console.warn(
            `[WebRTC] Ignoring python-ready while signalingState is ${pc.signalingState}.`,
          );
          return;
        }
        offerSent = true;
        try {
          await createAndSendOffer(pc, socket, sessionId, peerId);
          recordResearchEvent?.("offer_sent", {
            peerId,
          });
        } catch (err) {
          offerSent = false;
          console.error("[WebRTC] Failed to create stream offer:", err);
          failStream(getErrorMessage(err, STREAM_OFFER_ERROR_MESSAGE));
        }
      }
    });

    void initialize();

    return () => {
      disposed = true;
      const preserveActiveSession =
        seamlessRestart || seamlessRestartRef.current;
      stopTelemetry();
      detachEngineInput();
      if (disconnectedTimeoutId !== null) {
        window.clearTimeout(disconnectedTimeoutId);
      }
      if (heartbeatIntervalId !== null) {
        window.clearInterval(heartbeatIntervalId);
      }
      if (bootReadyTimeoutId !== null) {
        window.clearTimeout(bootReadyTimeoutId);
      }

      if (pc) {
        pc.close();
        if (pcRef.current === pc) pcRef.current = null;
      }
      socket.emit("webrtc-peer-disconnect", { peerId, sessionId });
      if (
        !preserveActiveSession &&
        localParticipantRef.current?.role === "host"
      ) {
        endSyncedMultiplayerLobby(sessionId);
        socket.emit("stop-session", { sessionId });
      }
      socket.disconnect();
      socketRef.current = null;

      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate-backend");
      socket.off("connect");
      socket.off("connect_error");
      socket.off("engine-error");
      socket.off("lobby-kicked");
      socket.off("lobby-state");
      socket.off("python-ready");

      if (!preserveActiveSession) {
        setStream(null);
        setTelemetry(INITIAL_WEBRTC_TELEMETRY);
      }
    };
  }, [
    gameId,
    options.displayName,
    options.mode,
    onResearchEvent,
    options.requestedRole,
    options.sessionId,
    pairingVersion,
    retryVersion,
    sessionId,
  ]);

  const retry = () => {
    onResearchEvent?.("retry_started", {
      reason: "manual_retry",
    });
    const identity = createWebRTCRetryIdentity(Boolean(options.sessionId));
    peerIdRef.current = identity.peerId;
    if (identity.sessionId) setSessionId(identity.sessionId);
    metricsDisabledRef.current = false;
    lastMetricSentAtRef.current = 0;
    seamlessRestartRef.current = false;
    profileAutoRetriesRemainingRef.current = 0;
    sessionConflictAutoRetriesRemainingRef.current = 1;
    setRetryVersion((currentVersion) => currentVersion + 1);
  };

  const reportBlackFrameStall = useCallback(() => {
    loadEngineLaunchFailureMessage().then((diagnosticMessage) => {
      onResearchEvent?.("engine_error", {
        message: diagnosticMessage || BLACK_FRAME_STALL_MESSAGE,
        source: "black_frame_stall",
      });
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError: diagnosticMessage || BLACK_FRAME_STALL_MESSAGE,
        lastUpdatedAt: Date.now(),
      }));
      setStatus("error");
    });
  }, [onResearchEvent]);

  const requestPlayerSlot = (playerIndex: number) => {
    const supportedPlayerCount =
      inputCapabilitiesRef.current.supportedPlayerCount;
    if (playerIndex > supportedPlayerCount) {
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError:
          inputCapabilitiesRef.current.limitationReason ||
          `Player slot ${playerIndex} is not available on this engine.`,
        lastUpdatedAt: Date.now(),
      }));
      return;
    }

    socketRef.current?.emit("request-player-slot", {
      playerIndex,
      sessionId: sessionIdRef.current,
    });
  };

  const releasePlayerSlot = () => {
    socketRef.current?.emit("release-player-slot", {
      sessionId: sessionIdRef.current,
    });
  };

  const kickParticipant = (socketId: string) => {
    socketRef.current?.emit("lobby-kick", {
      sessionId: sessionIdRef.current,
      socketId,
    });
  };

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
    telemetry,
  };
}
