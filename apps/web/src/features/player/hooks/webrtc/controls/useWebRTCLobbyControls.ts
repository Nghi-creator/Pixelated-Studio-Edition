import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EngineInputCapabilities } from "../../../../../lib/webrtc/types";
import type { WebRTCTelemetry } from "../../../../../lib/webrtc/telemetry/webrtcTelemetry";
import type { EngineSocket } from "../../../../../lib/webrtc/transport/webrtcSocket";

export function useWebRTCLobbyControls({
  inputCapabilitiesRef,
  sessionIdRef,
  setTelemetry,
  socketRef,
}: {
  inputCapabilitiesRef: { current: EngineInputCapabilities };
  sessionIdRef: { current: string };
  setTelemetry: Dispatch<SetStateAction<WebRTCTelemetry>>;
  socketRef: { current: EngineSocket | null };
}) {
  const requestPlayerSlot = useCallback((playerIndex: number) => {
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
  }, [inputCapabilitiesRef, sessionIdRef, setTelemetry, socketRef]);

  const releasePlayerSlot = useCallback(() => {
    socketRef.current?.emit("release-player-slot", {
      sessionId: sessionIdRef.current,
    });
  }, [sessionIdRef, socketRef]);

  const kickParticipant = useCallback((socketId: string) => {
    socketRef.current?.emit("lobby-kick", {
      sessionId: sessionIdRef.current,
      socketId,
    });
  }, [sessionIdRef, socketRef]);

  return {
    kickParticipant,
    releasePlayerSlot,
    requestPlayerSlot,
  };
}
