import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { clearEngineToken, ensureEngineToken } from "./engineAuth";
import { ENGINE_URL } from "./engineConfig";
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

const socket = io(ENGINE_URL, { autoConnect: false });

export function useWebRTC(gameId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>(
    gameId ? "connecting" : "idle",
  );
  const [telemetry, setTelemetry] = useState<WebRTCTelemetry>(
    INITIAL_WEBRTC_TELEMETRY,
  );

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef(createWebRTCSessionId());

  useEffect(() => {
    if (!gameId) return;

    const sessionId = sessionIdRef.current;
    const engineToken = ensureEngineToken();

    if (!engineToken) {
      queueMicrotask(() => setStatus("error"));
      return;
    }

    socket.auth = { token: engineToken };
    socket.connect();

    const pc = createEnginePeerConnection({
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
    const stopTelemetry = startWebRTCTelemetry(pc, (nextTelemetry) => {
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        ...nextTelemetry,
      }));
    });

    socket.on("webrtc-answer", (answer) => {
      pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc-ice-candidate-backend", (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("connect_error", (err) => {
      console.error("[WebRTC] Engine connection failed:", err.message);
      if (err.message === "Invalid engine pairing token") {
        clearEngineToken();
      }
      setStatus("error");
    });

    socket.on("engine-error", (payload: { message?: string }) => {
      console.error("[WebRTC] Engine error:", payload?.message);
      setTelemetry((currentTelemetry) => ({
        ...currentTelemetry,
        lastEngineError: payload?.message || "Engine error",
        lastUpdatedAt: Date.now(),
      }));
      setStatus("error");
    });

    socket.on("connect", async () => {
      console.log("[WebRTC] Connected. Booting sequence initiated.");
      socket.emit("join-session", { sessionId, role: "browser" });

      try {
        const bootTarget = await resolveGameBootTarget(gameId);
        socket.emit("start-game", {
          sessionId,
          ...bootTarget,
        });
      } catch (err) {
        console.error("Failed to boot game:", err);
        setStatus("error");
      }
    });

    socket.on("python-ready", async () => {
      console.log("[WebRTC] Python is awake! Generating and sending Offer...");
      await createAndSendOffer(pc, socket, sessionId);
    });

    const detachEngineInput = attachEngineInput(socket, sessionId);

    return () => {
      stopTelemetry();
      detachEngineInput();

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
  }, [gameId]);

  return { stream, status, telemetry };
}
