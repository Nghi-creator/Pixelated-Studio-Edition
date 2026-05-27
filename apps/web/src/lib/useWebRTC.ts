import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, ApiError } from "./apiClient";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  ensureEngineToken,
} from "./engineAuth";
import { getEngineUrl } from "./engineConfig";
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
import {
  INITIAL_WEBRTC_TELEMETRY,
  startWebRTCTelemetry,
  type WebRTCTelemetry,
} from "./webrtcTelemetry";

const STREAM_METRIC_SEND_INTERVAL_MS = 5_000;
const DISCONNECTED_GRACE_MS = 5_000;
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

async function loadIceServers() {
  try {
    const { iceServers } = await api.iceServers();
    return iceServers.length ? iceServers : FALLBACK_ICE_SERVERS;
  } catch (err) {
    console.warn("[WebRTC] Falling back to default STUN config:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

export function useWebRTC(gameId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>(
    gameId ? "connecting" : "idle",
  );
  const [telemetry, setTelemetry] = useState<WebRTCTelemetry>(
    INITIAL_WEBRTC_TELEMETRY,
  );
  const [pairingVersion, setPairingVersion] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef(createWebRTCSessionId());
  const lastMetricSentAtRef = useRef(0);
  const metricsDisabledRef = useRef(false);

  useEffect(() => {
    const handlePairingChange = () =>
      setPairingVersion((currentVersion) => currentVersion + 1);

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
  }, []);

  useEffect(() => {
    if (!gameId) return;

    const sessionId = sessionIdRef.current;
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

    const socket = io(getEngineUrl(), { autoConnect: false });
    socket.auth = { token: engineToken };
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
      setTelemetry(INITIAL_WEBRTC_TELEMETRY);
      lastMetricSentAtRef.current = 0;

      iceServersForSession = await loadIceServers();
      if (disposed) return;

      pc = createEnginePeerConnection({
        iceServers: iceServersForSession,
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

      detachEngineInput = attachEngineInput(socket, sessionId);
      socket.connect();
    };

    socket.on("webrtc-answer", (answer) => {
      pc?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc-ice-candidate-backend", (candidate) => {
      pc?.addIceCandidate(new RTCIceCandidate(candidate));
    });

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
      socket.emit("join-session", { sessionId, role: "browser" });

      try {
        const bootTarget = await resolveGameBootTarget(gameId, sessionId);
        socket.emit("start-game", {
          sessionId,
          iceServers: iceServersForSession,
          ...bootTarget,
        });
      } catch (err) {
        console.error("Failed to boot game:", err);
        setStatus("error");
      }
    });

    socket.on("python-ready", async () => {
      console.log("[WebRTC] Python is awake! Generating and sending Offer...");
      if (pc) {
        await createAndSendOffer(pc, socket, sessionId);
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
      socket.emit("stop-session", { sessionId });
      socket.disconnect();

      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate-backend");
      socket.off("connect");
      socket.off("connect_error");
      socket.off("engine-error");
      socket.off("python-ready");

      setStream(null);
      setTelemetry(INITIAL_WEBRTC_TELEMETRY);
    };
  }, [gameId, pairingVersion, retryVersion]);

  const retry = () => {
    sessionIdRef.current = createWebRTCSessionId();
    metricsDisabledRef.current = false;
    lastMetricSentAtRef.current = 0;
    setRetryVersion((currentVersion) => currentVersion + 1);
  };

  return { retry, stream, status, telemetry };
}
