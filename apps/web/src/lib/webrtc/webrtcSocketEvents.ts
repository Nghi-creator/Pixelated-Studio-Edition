import { clearEngineToken } from "../engine/engineAuth";
import {
  loadEngineInputCapabilities,
  loadEngineShareContext,
} from "./engineContext";
import { attachEngineInput } from "./webrtcInput";
import { syncMultiplayerLobby } from "./webrtcLobbySync";
import { createAndSendOffer } from "./webrtcPeer";
import {
  getErrorMessage,
  STREAM_OFFER_ERROR_MESSAGE,
  STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE,
} from "./streamErrors";
import { handleWebRTCSocketConnect } from "./webrtcBootFlow";
import type { LobbyState } from "./types";
import type {
  FailStream,
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "./webrtcLifecycleTypes";

export function bindWebRTCSocketEvents({
  config,
  failStream,
  params,
  runtime,
}: {
  config: WebRTCSessionConfig;
  failStream: FailStream;
  params: UseWebRTCSessionLifecycleParams;
  runtime: WebRTCSessionRuntime;
}) {
  runtime.socket.on(
    "webrtc-answer",
    (answer: RTCSessionDescriptionInit & { peerId?: string }) => {
      if (answer.peerId !== config.peerId) {
        console.warn("[WebRTC] Ignoring answer without matching peer id.");
        return;
      }

      if (!runtime.pc || runtime.pc.signalingState !== "have-local-offer") {
        console.warn(
          `[WebRTC] Ignoring answer for peer ${config.peerId} while signalingState is ${runtime.pc?.signalingState || "closed"}.`,
        );
        return;
      }

      params.onResearchEvent?.("answer_received", {
        peerId: config.peerId,
      });
      runtime.pc
        .setRemoteDescription(new RTCSessionDescription(answer))
        .catch((err) => {
          console.error("[WebRTC] Failed to apply answer:", err);
          failStream(
            getErrorMessage(err, STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE),
          );
        });
    },
  );

  runtime.socket.on(
    "webrtc-ice-candidate-backend",
    (candidate: RTCIceCandidateInit & { peerId?: string }) => {
      if (candidate.peerId !== config.peerId) return;
      runtime.pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
        console.warn("[WebRTC] Failed to add ICE candidate:", err);
      });
    },
  );

  runtime.socket.on("connect_error", (err) => {
    console.error("[WebRTC] Engine connection failed:", err.message);
    params.onResearchEvent?.("engine_error", {
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

  runtime.socket.on("engine-error", (payload: { code?: string; message?: string }) => {
    console.error("[WebRTC] Engine error:", payload?.message);
    params.onResearchEvent?.("engine_error", {
      code: payload?.code || null,
      message: payload?.message || null,
      source: "engine-error",
    });
    if (payload?.code === "engine_access_revoked") {
      clearEngineToken();
    }
    failStream(payload?.message || "Engine error");
  });

  runtime.socket.on("connect", () => {
    void handleWebRTCSocketConnect({ config, failStream, params, runtime });
  });

  runtime.socket.on("lobby-state", (nextLobbyState: LobbyState) => {
    const participant =
      nextLobbyState.participants.find(
        (entry) => entry.socketId === runtime.socket.id,
      ) || null;
    params.setLobbyState(nextLobbyState);
    params.setLocalParticipant(participant);
    params.localParticipantRef.current = participant;

    runtime.detachEngineInput();
    if (participant?.playerIndex) {
      runtime.detachEngineInput = attachEngineInput(
        runtime.socket,
        params.sessionId,
        participant.playerIndex,
      );
    }

    if (participant?.role === "host") {
      syncMultiplayerLobby({
        gameId: params.gameId,
        inputCapabilities: params.inputCapabilitiesRef.current,
        lobbyState: nextLobbyState,
        sessionId: params.sessionId,
        shareContext: params.shareContextRef.current,
      });
    }
  });

  runtime.socket.on("lobby-kicked", () => {
    failStream("The host removed you from the lobby.");
  });

  runtime.socket.on("python-ready", async () => {
    params.onResearchEvent?.("python_ready");
    if (runtime.bootReadyTimeoutId !== null) {
      window.clearTimeout(runtime.bootReadyTimeoutId);
      runtime.bootReadyTimeoutId = null;
    }
    console.log("[WebRTC] Python is awake! Generating and sending Offer...");
    loadEngineInputCapabilities().then((nextInputCapabilities) => {
      if (!runtime.disposed) {
        params.inputCapabilitiesRef.current = nextInputCapabilities;
        params.setInputCapabilities(nextInputCapabilities);
      }
    });
    loadEngineShareContext().then((nextShareContext) => {
      if (!runtime.disposed) {
        params.shareContextRef.current = nextShareContext;
        params.setShareContext(nextShareContext);
      }
    });
    if (runtime.pc) {
      if (runtime.offerSent) {
        console.warn("[WebRTC] Ignoring duplicate python-ready for active peer.");
        return;
      }
      if (runtime.pc.signalingState !== "stable") {
        console.warn(
          `[WebRTC] Ignoring python-ready while signalingState is ${runtime.pc.signalingState}.`,
        );
        return;
      }
      runtime.offerSent = true;
      try {
        await createAndSendOffer(
          runtime.pc,
          runtime.socket,
          params.sessionId,
          config.peerId,
        );
        params.onResearchEvent?.("offer_sent", {
          peerId: config.peerId,
        });
      } catch (err) {
        runtime.offerSent = false;
        console.error("[WebRTC] Failed to create stream offer:", err);
        failStream(getErrorMessage(err, STREAM_OFFER_ERROR_MESSAGE));
      }
    }
  });
}
