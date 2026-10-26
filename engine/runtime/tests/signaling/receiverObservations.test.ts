import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import { createSignalingPeerRegistry, registerSignalingRelayHandlers } from "../../src/signaling/signalingRelay";
import { joinSession } from "../../src/signaling/sessionRooms";
import { receiverChallenge, receiverObservation } from "../../src/signaling/receiverObservations";

class Fake extends EventEmitter {
  data: Record<string, unknown> = { sessionId: "session" };
  rooms = new Set<string>();
  nsp = { sockets: new Map<string, Fake>() };
  relays: Array<{ room: string; event: string; payload: unknown }> = [];
  constructor(public id: string) { super(); }
  join(room: string) { this.rooms.add(room); }
  leave(room: string) { this.rooms.delete(room); }
  to(room: string) { return { emit: (event: string, payload: unknown) => this.relays.push({ room, event, payload }) }; }
}
const bindingId = "a".repeat(64);
const offerHash = createHash("sha256").update("offer").digest("hex");
const challenge = { peerId: "peer", bindingId, offerHash };
const observation = { peerId: "peer", bindingId, clockId: "clock", sequence: 0, elapsedNs: 1, framesDecoded: 5, presentedFrames: 4 };

function fixture() {
  const registry = createSignalingPeerRegistry(2);
  let now = 1000;
  let allowed = true;
  const browser = new Fake("browser");
  const foreign = new Fake("foreign");
  const camera = new Fake("camera"); camera.data.trustedCamera = true;
  const sockets = new Map([browser, foreign, camera].map((socket) => [socket.id, socket]));
  for (const socket of sockets.values()) socket.nsp.sockets = sockets;
  for (const socket of [browser, foreign, camera]) registerSignalingRelayHandlers(socket as never, { peerRegistry: registry, now: () => now, canCreatePeer: () => allowed });
  browser.emit("webrtc-offer", { peerId: "peer", type: "offer", sdp: "offer" });
  camera.emit("webrtc-receiver-bind", challenge);
  browser.relays = []; camera.relays = [];
  return { registry, browser, foreign, camera, revoke: () => { allowed = false; }, tick: () => { now += 200; } };
}

test("receiver messages are closed, bounded data with no mutation or receipt fields", () => {
  assert.deepEqual(receiverChallenge(challenge), challenge);
  assert.deepEqual(receiverObservation(observation), observation);
  for (const value of [null, [], { ...observation, framesDecoded: true }, { ...observation, sequence: 2 ** 53 },
    { ...observation, observedNs: 123 }, { ...observation, targetFps: 24 }, { ...observation, bindingId: "x" }]) assert.equal(receiverObservation(value), null);
});

test("observations reach only the issuing camera with server-stamped owner identity", () => {
  const { browser, camera } = fixture();
  browser.emit("webrtc-receiver-observation", observation);
  assert.deepEqual(browser.relays, [{ room: "camera", event: "webrtc-receiver-observation", payload: { ...observation, offerHash, receiverSocketId: "browser" } }]);
  assert.deepEqual(camera.relays, []);
});

test("foreign sockets and browser camera-role claims do not acquire bindings", () => {
  const { foreign, browser } = fixture();
  foreign.emit("webrtc-receiver-observation", observation);
  foreign.emit("webrtc-receiver-bind", challenge);
  assert.deepEqual(foreign.relays, []);
  browser.emit("webrtc-receiver-observation", observation);
  assert.equal(browser.relays.length, 1);
});

test("camera challenge must match the registered offer and active session", () => {
  const { camera } = fixture();
  camera.emit("webrtc-receiver-bind", { ...challenge, offerHash: "b".repeat(64) });
  camera.emit("webrtc-receiver-bind", { ...challenge, sessionId: "other" });
  camera.data.sessionId = "other";
  camera.emit("webrtc-receiver-bind", challenge);
  assert.deepEqual(camera.relays, []);
});

test("replays, counter reset, clock replacement and flood invalidate the observation binding", () => {
  for (const change of [{ sequence: 0 }, { framesDecoded: 4 }, { clockId: "replacement" }, { elapsedNs: 0 }]) {
    const { browser, tick } = fixture();
    browser.emit("webrtc-receiver-observation", observation); tick();
    browser.emit("webrtc-receiver-observation", { ...observation, sequence: 1, elapsedNs: 200000001, ...change }); tick();
    browser.emit("webrtc-receiver-observation", { ...observation, sequence: 2, elapsedNs: 400000001 });
    assert.equal(browser.relays.length, 1);
  }
  const { browser } = fixture();
  browser.emit("webrtc-receiver-observation", observation);
  browser.emit("webrtc-receiver-observation", { ...observation, sequence: 1, elapsedNs: 200000001 });
  assert.equal(browser.relays.length, 1);
});

test("duplicate challenges do not reset sequences; a new nonce rejects old reports", () => {
  const { browser, camera, tick } = fixture();
  browser.emit("webrtc-receiver-observation", observation); tick();
  camera.emit("webrtc-receiver-bind", challenge);
  browser.emit("webrtc-receiver-observation", { ...observation, sequence: 1, elapsedNs: 200000001 });
  assert.equal(browser.relays.length, 2);
  camera.emit("webrtc-receiver-bind", { ...challenge, bindingId: "b".repeat(64) }); tick();
  browser.emit("webrtc-receiver-observation", { ...observation, sequence: 2, elapsedNs: 400000001 });
  assert.equal(browser.relays.length, 2);
});

test("offer replacement, session switch and camera disconnect revoke observations", () => {
  const { browser, camera, tick } = fixture();
  browser.emit("webrtc-offer", { peerId: "peer", type: "offer", sdp: "changed" });
  browser.relays = [];
  browser.emit("webrtc-receiver-observation", observation);
  assert.equal(browser.relays.length, 0);
  const next = fixture();
  next.camera.emit("disconnect");
  assert.equal(next.camera.relays[0]?.event, "webrtc-receiver-unbind");
  next.browser.emit("webrtc-receiver-observation", observation);
  assert.equal(next.browser.relays.length, 0);
  camera.emit("webrtc-receiver-bind", challenge); tick();
  joinSession(browser as never, "other"); browser.relays = [];
  browser.emit("webrtc-receiver-observation", observation);
  assert.equal(browser.relays.length, 0);
});

test("live lobby permission and camera role are rechecked before forwarding", () => {
  const revoked = fixture(); revoked.revoke();
  revoked.browser.emit("webrtc-receiver-observation", observation);
  assert.equal(revoked.browser.relays.length, 0);
  const changed = fixture(); changed.camera.data.trustedCamera = false;
  changed.browser.emit("webrtc-receiver-observation", observation);
  changed.camera.data.trustedCamera = true; changed.tick();
  changed.browser.emit("webrtc-receiver-observation", { ...observation, sequence: 1, elapsedNs: 200000001 });
  assert.equal(changed.browser.relays.length, 0);
});
