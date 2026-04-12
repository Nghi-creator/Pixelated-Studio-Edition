import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { supabase } from "./supabaseClient";

// Use 127.0.0.1 for Mac/Local stability
const socket = io("http://127.0.0.1:8080", {
  transports: ["websocket"],
  autoConnect: false,
});

export function useWebRTC(gameId: string) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "playing" | "error"
  >("connecting");
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!gameId) return;

    // The logic that tells the server to switch games
    const bootNewGame = async () => {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("rom_filename")
          .eq("id", gameId)
          .single();

        if (error || !data) throw new Error("Game not found");

        console.log(`[WebRTC] Switching server to: ${data.rom_filename}`);
        // FORCE isRemote: true so it uses WebRTC
        socket.emit("start-game", {
          romFilename: data.rom_filename,
          isRemote: true,
        });
      } catch (err) {
        console.error("Boot failed:", err);
        setStatus("error");
      }
    };

    // Fix: If already connected, boot immediately. Don't wait for 'connect'
    if (socket.connected) {
      bootNewGame();
    } else {
      socket.connect();
      socket.once("connect", bootNewGame);
    }

    // --- WebRTC Logic ---
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      setStream((prev) => {
        const newStream = prev || new MediaStream();
        newStream.addTrack(event.track);
        return newStream;
      });
      setStatus("playing");
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit("webrtc-ice-candidate", event.candidate);
    };

    socket.on("webrtc-answer", (answer) =>
      pc.setRemoteDescription(new RTCSessionDescription(answer)),
    );
    socket.on("webrtc-ice-candidate-backend", (candidate) =>
      pc.addIceCandidate(new RTCIceCandidate(candidate)),
    );

    socket.on("python-ready", async () => {
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { type: offer.type, sdp: offer.sdp });
    });

    return () => {
      socket.off("connect");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate-backend");
      socket.off("python-ready");
      pc.close();
    };
  }, [gameId]); // Refires perfectly when the game changes

  return { stream, status };
}
