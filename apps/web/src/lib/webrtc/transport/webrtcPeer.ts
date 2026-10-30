import type { Socket } from "socket.io-client";
import { createLocalIceQueue } from "./localIceQueue.ts";

const localIce = new WeakMap<RTCPeerConnection, ReturnType<typeof createLocalIceQueue>>();

type PeerConnectionOptions = {
  iceServers?: RTCIceServer[];
  peerId: string;
  socket: Socket;
  sessionId: string;
  onTrack: (track: MediaStreamTrack) => void;
};

export const createEnginePeerConnection = ({
  iceServers,
  peerId,
  socket,
  sessionId,
  onTrack,
}: PeerConnectionOptions) => {
  const peerConnection = new RTCPeerConnection({
    iceServers: iceServers?.length
      ? iceServers
      : [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnection.ontrack = (event) => {
    console.log(`[WebRTC] Track received: ${event.track.kind}`);
    onTrack(event.track);
  };

  const queue = createLocalIceQueue({
    isCurrent: () => peerConnection.signalingState !== "closed",
    send: (candidate) => socket.emit("webrtc-ice-candidate", { sessionId, peerId, candidate }),
    onOverflow: () => peerConnection.close(),
  });
  localIce.set(peerConnection, queue);
  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) queue.add(candidate.toJSON());
  };

  return peerConnection;
};

export const createAndSendOffer = async (
  peerConnection: RTCPeerConnection,
  socket: Socket,
  sessionId: string,
  peerId: string,
  onOffer?: (sdp: string) => void,
) => {
  if (peerConnection.signalingState !== "stable") {
    throw new Error(
      `Cannot create WebRTC offer while signalingState is ${peerConnection.signalingState}.`,
    );
  }

  const transceivers = peerConnection.getTransceivers();
  if (!transceivers.some((entry) => entry.receiver.track?.kind === "video")) {
    peerConnection.addTransceiver("video", { direction: "recvonly" });
  }
  if (!transceivers.some((entry) => entry.receiver.track?.kind === "audio")) {
    peerConnection.addTransceiver("audio", { direction: "recvonly" });
  }

  const requireOpen = () => {
    if (peerConnection.signalingState === "closed") throw new Error("WebRTC connection closed before offer publication.");
  };
  const offer = await peerConnection.createOffer();
  requireOpen();
  await peerConnection.setLocalDescription(offer);
  requireOpen();
  onOffer?.(offer.sdp || "");
  requireOpen();
  const sendOffer = () => socket.emit("webrtc-offer", { sessionId, peerId, type: offer.type, sdp: offer.sdp });
  const queue = localIce.get(peerConnection);
  if (queue) queue.publish(sendOffer);
  else sendOffer();
};

