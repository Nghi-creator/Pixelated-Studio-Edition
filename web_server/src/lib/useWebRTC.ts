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
      console.log("[WebRTC] Connected. Booting sequence initiated.");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id || "anonymous";

      if (gameId.toLowerCase().endsWith(".nes")) {
        console.log(
          `[WebRTC] Local Vault game detected. Booting directly: ${gameId} for user ${userId}`,
        );
        socket.emit("start-game", { romFilename: gameId, userId: userId });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("games")
          .select("rom_url, rom_filename")
          .eq("id", gameId)
          .single();

        if (error || !data) throw new Error("Game not found in DB");

        const targetBootString = data.rom_url || data.rom_filename;

        console.log(
          `[WebRTC] Cloud Game found. Sending boot string: ${targetBootString}`,
        );
        socket.emit("start-game", {
          romFilename: targetBootString,
          userId: userId,
        });
      } catch (err) {
        console.error("Failed to boot game:", err);
        setStatus("error");
      }
    });

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

      if (pcRef.current) {
        pcRef.current.close();
      }
      socket.disconnect();

      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate-backend");
      socket.off("connect");
      socket.off("python-ready");

      setStream(null);
    };
  }, [gameId]);

  return { stream, status };
}
