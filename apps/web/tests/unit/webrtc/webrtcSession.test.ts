import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebRTCProfileRestartIdentity,
  createWebRTCRetryIdentity,
} from "../../../src/lib/webrtc/webrtcIdentity.ts";

test("WebRTC retry rotates peer identity and local session identity", () => {
  const first = createWebRTCRetryIdentity(false);
  const second = createWebRTCRetryIdentity(false);

  assert.notEqual(first.peerId, second.peerId);
  assert.notEqual(first.sessionId, second.sessionId);
});

test("WebRTC retry preserves externally supplied session identity", () => {
  const identity = createWebRTCRetryIdentity(true);

  assert.equal(identity.sessionId, null);
  assert.ok(identity.peerId);
});

test("stream profile restarts rotate only the peer identity", () => {
  const first = createWebRTCProfileRestartIdentity();
  const second = createWebRTCProfileRestartIdentity();

  assert.notEqual(first.peerId, second.peerId);
  assert.equal(first.sessionId, null);
  assert.equal(second.sessionId, null);
});
