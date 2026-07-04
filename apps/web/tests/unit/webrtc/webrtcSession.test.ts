import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebRTCProfileRestartIdentity,
  createWebRTCRetryIdentity,
} from "../../../src/lib/webrtc/webrtcIdentity.ts";
import { assertEngineRuntimeKindMatches } from "../../../src/lib/webrtc/runtimeKind.ts";
import { isRetryableBackendSessionConflict } from "../../../src/lib/webrtc/webrtcSessionErrors.ts";

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

test("engine runtime guard explains native/libretro mismatches before boot", () => {
  assert.doesNotThrow(() =>
    assertEngineRuntimeKindMatches("libretro", "libretro"),
  );
  assert.doesNotThrow(() =>
    assertEngineRuntimeKindMatches("native_linux", "native_linux"),
  );
  assert.throws(
    () => assertEngineRuntimeKindMatches("native_linux", "libretro"),
    /native Linux engine/,
  );
  assert.throws(
    () => assertEngineRuntimeKindMatches("libretro", "native_linux"),
    /libretro engine/,
  );
});

test("backend session conflicts are retryable", () => {
  assert.equal(
    isRetryableBackendSessionConflict({ status: 409 }),
    true,
  );
  assert.equal(
    isRetryableBackendSessionConflict({ status: 500 }),
    false,
  );
  assert.equal(isRetryableBackendSessionConflict(new Error("Conflict")), false);
});
