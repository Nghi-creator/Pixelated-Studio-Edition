import type { Socket } from "socket.io-client";

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

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        sessionId,
        peerId,
        candidate: event.candidate,
      });
    }
  };

  return peerConnection;
};

export const createAndSendOffer = async (
  peerConnection: RTCPeerConnection,
  socket: Socket,
  sessionId: string,
  peerId: string,
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

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc-offer", {
    sessionId,
    peerId,
    type: offer.type,
    sdp: offer.sdp,
  });
};
