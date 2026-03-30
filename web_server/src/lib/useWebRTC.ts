import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";

const socket = io("http://localhost:8080", { autoConnect: false });

export function useWebRTC(gameId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [status, setStatus] = useState<
    "idle" | "connecting" | "playing" | "error"
  >(gameId ? "connecting" : "idle");

  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!gameId) return;

    socket.connect();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Track received: ${event.track.kind}`);
      setStream((prevStream) => {
        const newStream = prevStream || new MediaStream();
        newStream.addTrack(event.track);
        return newStream;
      });
      setStatus("playing");
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit("webrtc-ice-candidate", event.candidate);
    };

    socket.on("webrtc-answer", (answer) => {
      pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc-ice-candidate-backend", (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("connect", async () => {
      console.log("[WebRTC] Connected. Fetching ROM data for:", gameId);

      try {
        const { data, error } = await supabase
          .from("games")
          .select("rom_filename")
          .eq("id", gameId)
          .single();

        if (error || !data) throw new Error("Game not found in DB");

        console.log(
          `[WebRTC] Requesting Node Server to boot: ${data.rom_filename}`,
        );
        socket.emit("start-game", { romFilename: data.rom_filename });
      } catch (err) {
        console.error("Failed to boot game:", err);
        setStatus("error");
      }
    });

    // 2. NEW LISTENER
    socket.on("python-ready", async () => {
      console.log("[WebRTC] Python is awake! Generating and sending Offer...");

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc-offer", {
        type: offer.type,
        sdp: offer.sdp,
      });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      socket.emit("keydown", { key: e.key });
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      socket.emit("keyup", { key: e.key });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      pc.close();
      socket.disconnect();
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate-backend");
      socket.off("connect");
      setStream(null);
    };
  }, [gameId]);

  return { stream, status };
}
