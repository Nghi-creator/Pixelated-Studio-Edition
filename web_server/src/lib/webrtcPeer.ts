import type { Socket } from "socket.io-client";

type PeerConnectionOptions = {
  socket: Socket;
  sessionId: string;
  onTrack: (track: MediaStreamTrack) => void;
};

export const createEnginePeerConnection = ({
  socket,
  sessionId,
  onTrack,
}: PeerConnectionOptions) => {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnection.ontrack = (event) => {
    console.log(`[WebRTC] Track received: ${event.track.kind}`);
    onTrack(event.track);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        sessionId,
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
) => {
  peerConnection.addTransceiver("video", { direction: "recvonly" });
  peerConnection.addTransceiver("audio", { direction: "recvonly" });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("webrtc-offer", {
    sessionId,
    type: offer.type,
    sdp: offer.sdp,
  });
};
