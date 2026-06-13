import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, ApiError } from "../apiClient";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  ensureEngineToken,
  getCompanionAccessToken,
} from "../engine/engineAuth";
import { engineEndpoint, getEngineUrl } from "../engine/engineConfig";
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
import { createWebRTCRetryIdentity } from "./webrtcIdentity";
import {
  INITIAL_WEBRTC_TELEMETRY,
  startWebRTCTelemetry,
  type WebRTCTelemetry,
} from "./webrtcTelemetry";
import type { StreamProfile } from "../engine/streamProfiles";

const STREAM_METRIC_SEND_INTERVAL_MS = 5_000;
const DISCONNECTED_GRACE_MS = 5_000;
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
const KEYBOARD_FALLBACK_PLAYER_COUNT = 2;
const VIRTUAL_GAMEPAD_PLAYER_COUNT = 4;

export type LobbyRole = "host" | "player" | "spectator";

export type LobbyParticipant = {
  connectedAt: string;
  displayName: string;
  playerIndex: number | null;
  role: LobbyRole;
  socketId: string;
};

export type LobbyState = {
  hostSocketId: string | null;
  maxPlayers: number;
  participants: LobbyParticipant[];
  sessionId: string;
};

export type EngineInputCapabilities = {
  limitationReason: string | null;
  source: "checking" | "health" | "unavailable";
  supportedPlayerCount: number;
};

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
};

export type WebRTCMode = "host" | "guest";

export type EngineShareContext = {
  companionUrls: string[];
  exposureMode: "local" | "lan" | "unknown";
};

type UseWebRTCOptions = {
  displayName?: string;
  mode?: WebRTCMode;
  requestedRole?: LobbyRole;
  sessionId?: string | null;
};

async function loadIceServers() {
  try {
    const { iceServers } = await api.iceServers();
    return iceServers.length ? iceServers : FALLBACK_ICE_SERVERS;
  } catch (err) {
    console.warn("[WebRTC] Falling back to default STUN config:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

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

async function loadEngineInputCapabilities(): Promise<EngineInputCapabilities> {
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

async function loadEngineShareContext(): Promise<EngineShareContext> {
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
    useState<EngineInputCapabilities>({
      limitationReason:
        "Checking engine gamepad support before enabling P3/P4. Spectators can still join.",
      source: "checking",
      supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
    });
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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerIdRef = useRef(createWebRTCSessionId());
  const sessionIdRef = useRef(sessionId);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const localParticipantRef = useRef<LobbyParticipant | null>(null);
  const inputCapabilitiesRef = useRef(inputCapabilities);
  const lastMetricSentAtRef = useRef(0);
  const metricsDisabledRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    inputCapabilitiesRef.current = inputCapabilities;
  }, [inputCapabilities]);

  useEffect(() => {
    const handlePairingChange = () =>
      setPairingVersion((currentVersion) => currentVersion + 1);

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
  }, []);

  useEffect(() => {
    if (!gameId) return;

    const peerId = peerIdRef.current;
    const mode = options.mode || "host";
    const requestedRole =
      options.requestedRole || (mode === "host" ? "host" : "spectator");
    const displayName =
      options.displayName || (mode === "host" ? "Host" : "Guest");
    const engineToken = ensureEngineToken();

    if (!engineToken) {
      queueMicrotask(() => {
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

    const companionAccessToken = getCompanionAccessToken(engineToken);
    const socket = io(getEngineUrl(), {
      autoConnect: false,
      query: companionAccessToken
        ? { companionToken: companionAccessToken }
        : undefined,
    });
    socketRef.current = socket;
    socket.auth = companionAccessToken ? {} : { token: engineToken };
    let pc: RTCPeerConnection | null = null;
    let stopTelemetry: () => void = () => undefined;
    let detachEngineInput: () => void = () => undefined;
    let disconnectedTimeoutId: number | null = null;
    let disposed = false;
    let iceServersForSession: RTCIceServer[] = FALLBACK_ICE_SERVERS;

    const failStream = (message: string) => {
      if (disposed) return;
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError: message,
        lastUpdatedAt: Date.now(),
      }));
      setStatus("error");
    };

    const initialize = async () => {
      setStatus("connecting");
      setStream(null);
      setLobbyState(null);
      setLocalParticipant(null);
      localParticipantRef.current = null;
      setInputCapabilities({
        limitationReason:
          "Checking engine gamepad support before enabling P3/P4. Spectators can still join.",
        source: "checking",
        supportedPlayerCount: KEYBOARD_FALLBACK_PLAYER_COUNT,
      });
      setShareContext({
        companionUrls: [],
        exposureMode: "unknown",
      });
      setTelemetry(INITIAL_WEBRTC_TELEMETRY);
      lastMetricSentAtRef.current = 0;

      const [nextIceServers, nextInputCapabilities, nextShareContext] =
        await Promise.all([
          loadIceServers(),
          loadEngineInputCapabilities(),
          loadEngineShareContext(),
        ]);
      if (disposed) return;
      iceServersForSession = nextIceServers;
      setInputCapabilities(nextInputCapabilities);
      setShareContext(nextShareContext);

      pc = createEnginePeerConnection({
        iceServers: iceServersForSession,
        peerId,
        socket,
        sessionId,
        onTrack: (track) => {
          setStream((prevStream) => {
            const newStream = prevStream || new MediaStream();
            newStream.addTrack(track);
            return newStream;
          });
          setStatus("playing");
        },
      });
      pcRef.current = pc;

      const handlePeerStateChange = () => {
        if (!pc) return;
        const { connectionState, iceConnectionState } = pc;

        if (connectionState === "failed" || iceConnectionState === "failed") {
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
      };

      pc.addEventListener("connectionstatechange", handlePeerStateChange);
      pc.addEventListener("iceconnectionstatechange", handlePeerStateChange);

      stopTelemetry = startWebRTCTelemetry(pc, (nextTelemetry) => {
        const metricSnapshot = {
          ...INITIAL_WEBRTC_TELEMETRY,
          ...nextTelemetry,
        };

        setTelemetry((currentTelemetry) => ({
          ...currentTelemetry,
          ...nextTelemetry,
        }));

        const now = Date.now();
        const metricTimestamp = nextTelemetry.lastUpdatedAt;

        if (
          metricsDisabledRef.current ||
          !metricTimestamp ||
          now - lastMetricSentAtRef.current < STREAM_METRIC_SEND_INTERVAL_MS
        ) {
          return;
        }

        lastMetricSentAtRef.current = now;
        api
          .streamMetric({
            bitrateKbps: metricSnapshot.bitrateKbps,
            connectionState: metricSnapshot.connectionState,
            fps: metricSnapshot.fps,
            iceConnectionState: metricSnapshot.iceConnectionState,
            jitterMs: metricSnapshot.jitterMs,
            packetsLost: metricSnapshot.packetsLost,
            sessionId,
            timestamp: new Date(metricTimestamp).toISOString(),
          })
          .catch((err) => {
            if (err instanceof ApiError && [401, 503].includes(err.status)) {
              metricsDisabledRef.current = true;
              return;
            }

            console.warn("[WebRTC] Failed to send stream metric:", err);
          });
      });

      socket.connect();
    };

    socket.on(
      "webrtc-answer",
      (answer: RTCSessionDescriptionInit & { peerId?: string }) => {
        if (answer.peerId && answer.peerId !== peerId) return;
        pc?.setRemoteDescription(new RTCSessionDescription(answer));
      },
    );

    socket.on(
      "webrtc-ice-candidate-backend",
      (candidate: RTCIceCandidateInit & { peerId?: string }) => {
        if (candidate.peerId && candidate.peerId !== peerId) return;
        pc?.addIceCandidate(new RTCIceCandidate(candidate));
      },
    );

    socket.on("connect_error", (err) => {
      console.error("[WebRTC] Engine connection failed:", err.message);
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

    socket.on("engine-error", (payload: { message?: string }) => {
      console.error("[WebRTC] Engine error:", payload?.message);
      failStream(payload?.message || "Engine error");
    });

    socket.on("connect", async () => {
      console.log("[WebRTC] Connected. Booting sequence initiated.");
      socket.emit("join-session", {
        sessionId,
        displayName,
        role: requestedRole,
      });

      if (mode !== "host") {
        return;
      }

      try {
        const bootTarget = await resolveGameBootTarget(gameId, sessionId);
        socket.emit("start-game", {
          sessionId,
          iceServers: iceServersForSession,
          streamProfile: {
            bitrateKbps: streamProfile.bitrateKbps,
            fps: streamProfile.fps,
            id: streamProfile.id,
          },
          ...bootTarget,
        });
      } catch (err) {
        console.error("Failed to boot game:", err);
        setStatus("error");
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
        const supportedMaxPlayers = Math.min(
          nextLobbyState.maxPlayers,
          inputCapabilitiesRef.current.supportedPlayerCount,
        );
        api
          .multiplayerLobby(sessionId, {
            engineUrl: getEngineUrl(),
            exposureMode: "unknown",
            gameId,
            maxPlayers: supportedMaxPlayers,
            participants: nextLobbyState.participants.map((entry) => ({
              displayName: entry.displayName,
              playerIndex: entry.playerIndex,
              role: entry.role,
            })),
          })
          .catch((err) => {
            if (err instanceof ApiError && [401, 503].includes(err.status)) {
              return;
            }

            console.warn("[WebRTC] Failed to save multiplayer lobby:", err);
          });
      }
    });

    socket.on("lobby-kicked", () => {
      failStream("The host removed you from the lobby.");
    });

    socket.on("python-ready", async () => {
      console.log("[WebRTC] Python is awake! Generating and sending Offer...");
      loadEngineInputCapabilities().then((nextInputCapabilities) => {
        if (!disposed) setInputCapabilities(nextInputCapabilities);
      });
      loadEngineShareContext().then((nextShareContext) => {
        if (!disposed) setShareContext(nextShareContext);
      });
      if (pc) {
        await createAndSendOffer(pc, socket, sessionId, peerId);
      }
    });

    void initialize();

    return () => {
      disposed = true;
      stopTelemetry();
      detachEngineInput();
      if (disconnectedTimeoutId !== null) {
        window.clearTimeout(disconnectedTimeoutId);
      }

      if (pcRef.current) {
        pcRef.current.close();
      }
      socket.emit("webrtc-peer-disconnect", { peerId, sessionId });
      if (localParticipantRef.current?.role === "host") {
        api.endMultiplayerLobby(sessionId).catch((err) => {
          if (err instanceof ApiError && [401, 503].includes(err.status)) {
            return;
          }

          console.warn("[WebRTC] Failed to end multiplayer lobby:", err);
        });
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

      setStream(null);
      setTelemetry(INITIAL_WEBRTC_TELEMETRY);
    };
  }, [
    gameId,
    options.displayName,
    options.mode,
    options.requestedRole,
    options.sessionId,
    pairingVersion,
    retryVersion,
    sessionId,
    streamProfile,
  ]);

  const retry = () => {
    const identity = createWebRTCRetryIdentity(Boolean(options.sessionId));
    peerIdRef.current = identity.peerId;
    if (identity.sessionId) setSessionId(identity.sessionId);
    metricsDisabledRef.current = false;
    lastMetricSentAtRef.current = 0;
    setRetryVersion((currentVersion) => currentVersion + 1);
  };

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
    sessionId,
    shareContext,
    stream,
    status,
    telemetry,
  };
}
