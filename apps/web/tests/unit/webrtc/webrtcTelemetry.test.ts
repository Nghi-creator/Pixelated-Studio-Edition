import assert from "node:assert/strict";
import test from "node:test";
import { startWebRTCTelemetry } from "../../../src/lib/webrtc/webrtcTelemetry.ts";

test("WebRTC telemetry cleanup removes listeners and polling", () => {
  const added: string[] = [];
  const removed: string[] = [];
  let clearedInterval: unknown;
  const originalWindow = globalThis.window;
  Object.assign(globalThis, {
    window: {
      clearInterval: (interval: unknown) => {
        clearedInterval = interval;
      },
      setInterval: () => 42,
    },
  });

  const peerConnection = {
    addEventListener: (event: string) => added.push(event),
    connectionState: "connected",
    getStats: async () => new Map(),
    iceConnectionState: "connected",
    removeEventListener: (event: string) => removed.push(event),
  };

  try {
    const stop = startWebRTCTelemetry(peerConnection as never, () => undefined);
    stop();

    assert.deepEqual(added, [
      "iceconnectionstatechange",
      "connectionstatechange",
    ]);
    assert.deepEqual(removed, added);
    assert.equal(clearedInterval, 42);
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});
