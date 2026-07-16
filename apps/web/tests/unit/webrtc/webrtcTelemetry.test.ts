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

test("WebRTC telemetry does not overlap polls or publish after cleanup", async () => {
  let intervalCallback = () => undefined;
  let resolveStats: ((stats: Map<string, unknown>) => void) | undefined;
  let statsCalls = 0;
  const published: unknown[] = [];
  const originalWindow = globalThis.window;
  Object.assign(globalThis, {
    window: {
      clearInterval: () => undefined,
      setInterval: (callback: () => undefined) => {
        intervalCallback = callback;
        return 42;
      },
    },
  });

  const peerConnection = {
    addEventListener: () => undefined,
    connectionState: "connected",
    getStats: () => {
      statsCalls += 1;
      return new Promise<Map<string, unknown>>((resolve) => {
        resolveStats = resolve;
      });
    },
    iceConnectionState: "connected",
    removeEventListener: () => undefined,
  };

  try {
    const stop = startWebRTCTelemetry(peerConnection as never, (value) => {
      published.push(value);
    });
    intervalCallback();
    intervalCallback();

    assert.equal(statsCalls, 1);
    stop();
    resolveStats?.(new Map());
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(published.length, 1);
  } finally {
    Object.assign(globalThis, { window: originalWindow });
  }
});
