import assert from "node:assert/strict";
import test from "node:test";
import { createAndSendOffer, createEnginePeerConnection } from "../../../src/lib/webrtc/transport/webrtcPeer.ts";

test("peer sends its offer before ICE gathered during setLocalDescription", async () => {
  const original = globalThis.RTCPeerConnection;
  const sent: string[] = [];
  class Peer {
    signalingState = "stable";
    onicecandidate?: (event: { candidate: { toJSON: () => RTCIceCandidateInit } }) => void;
    getTransceivers() { return [{ receiver: { track: { kind: "video" } } }, { receiver: { track: { kind: "audio" } } }]; }
    async createOffer() { return { type: "offer", sdp: "offer" }; }
    async setLocalDescription() {
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "early" }) } });
      this.signalingState = "have-local-offer";
    }
  }
  globalThis.RTCPeerConnection = Peer as unknown as typeof RTCPeerConnection;
  try {
    const socket = { emit: (kind: string) => sent.push(kind) };
    const peer = createEnginePeerConnection({ socket: socket as never, sessionId: "session", peerId: "peer", onTrack: () => {} });
    await createAndSendOffer(peer, socket as never, "session", "peer");
    assert.deepEqual(sent, ["webrtc-offer", "webrtc-ice-candidate"]);
  } finally { globalThis.RTCPeerConnection = original; }
});

test("connection closing during offer preparation cannot publish stale work", async () => {
  for (const stage of ["create", "local", "callback"]) {
    const sent: string[] = [];
    const peer = { signalingState: "stable", getTransceivers: () => [{ receiver: { track: { kind: "video" } } }, { receiver: { track: { kind: "audio" } } }],
      createOffer: async () => { if (stage === "create") peer.signalingState = "closed"; return { type: "offer", sdp: "sdp" }; },
      setLocalDescription: async () => { if (stage === "local") peer.signalingState = "closed"; } };
    await assert.rejects(createAndSendOffer(peer as never, { emit: (kind: string) => sent.push(kind) } as never,
      "session", "peer", () => { if (stage === "callback") peer.signalingState = "closed"; }), /closed/);
    assert.deepEqual(sent, []);
  }
});
