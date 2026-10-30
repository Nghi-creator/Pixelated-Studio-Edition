import { bindWebRTCEngineErrors } from "./webrtcEngineErrors";
import { offerDigest, parseReceiverChallenge, startReceiverObservation } from "../telemetry/receiverObservation";
import { clearEngineToken } from "../../engine/engineAuth";
import { loadEngineSessionContext } from "../engine/engineContext";
import { attachEngineInput } from "../input/webrtcInput";
import { syncMultiplayerLobby } from "../lobby/webrtcLobbySync";
import { createAndSendOffer } from "./webrtcPeer";
import {
  getErrorMessage,
  STREAM_OFFER_ERROR_MESSAGE,
  STREAM_REMOTE_DESCRIPTION_ERROR_MESSAGE,
} from "../streamErrors";
import { handleWebRTCSocketConnect } from "../session/webrtcBootFlow";
import type { LobbyState } from "../types";
import type {
  FailStream,
  UseWebRTCSessionLifecycleParams,
  WebRTCSessionConfig,
  WebRTCSessionRuntime,
} from "../session/webrtcLifecycleTypes";

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
  const stopReceiver = () => {
    runtime.receiverObservationGeneration = (runtime.receiverObservationGeneration || 0) + 1;
    runtime.stopReceiverObservation?.();
    runtime.stopReceiverObservation = undefined;
    runtime.receiverBindingId = undefined;
  };
  runtime.socket.on("webrtc-receiver-bind", async (raw: unknown) => {
    const challenge = parseReceiverChallenge(raw);
    if (!challenge || challenge.peerId !== config.peerId || runtime.disposed || !runtime.pc || !runtime.offeredSdp ||
        challenge.bindingId === runtime.receiverBindingId) return;
    stopReceiver();
    const generation = runtime.receiverObservationGeneration;
    const pc = runtime.pc;
    const sdp = runtime.offeredSdp;
    try {
      if (await offerDigest(sdp) !== challenge.offerHash || runtime.disposed || runtime.pc !== pc ||
          runtime.receiverObservationGeneration !== generation || !runtime.socket.connected) return;
      runtime.receiverBindingId = challenge.bindingId;
      runtime.stopReceiverObservation = startReceiverObservation({ pc, challenge,
        getVideo: () => params.options.videoElementRef?.current || null,
        getStream: () => runtime.incomingStream,
        isCurrent: () => !runtime.disposed && runtime.pc === pc && runtime.socket.connected && runtime.receiverObservationGeneration === generation,
        emit: (sample) => runtime.socket.emit("webrtc-receiver-observation", sample),
      });
    } catch { if (runtime.receiverObservationGeneration === generation) stopReceiver(); }
  });
  runtime.socket.on("webrtc-receiver-unbind", (raw: { peerId?: unknown; bindingId?: unknown } | null) => {
    if (raw?.peerId === config.peerId && raw.bindingId === runtime.receiverBindingId) stopReceiver();
  });
  runtime.socket.on("disconnect", stopReceiver);

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
      clearEngineToken("rejected");
      failStream(
        "The saved desktop pairing token was rejected. Pair the local engine again, then retry.",
      );
      return;
    }
    failStream(
      "Could not reach the local engine. Make sure the desktop app is running, then retry.",
    );
  });

  bindWebRTCEngineErrors({
    socket: runtime.socket, peerId: config.peerId,
    isDisposed: () => runtime.disposed,
    failStream,
    report: (details) => params.onResearchEvent?.("engine_error", details),
    clearRejectedToken: () => clearEngineToken("rejected"),
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
    loadEngineSessionContext().then((nextEngineContext) => {
      if (!runtime.disposed) {
        params.inputCapabilitiesRef.current = nextEngineContext.inputCapabilities;
        params.setInputCapabilities(nextEngineContext.inputCapabilities);
        params.shareContextRef.current = nextEngineContext.shareContext;
        params.setShareContext(nextEngineContext.shareContext);
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
          (sdp) => { runtime.offeredSdp = sdp; },
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
