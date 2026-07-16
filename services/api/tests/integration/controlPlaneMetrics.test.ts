import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSupabase,
  createTestApp,
} from "./support/controlPlaneTestHarness.js";

test("stream metrics persist and rate-limit per user session", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);
  const metric = {
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3,
    packetsLost: 0,
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
  };

  const firstResponse = await app.inject({
    method: "POST",
    payload: metric,
    url: "/metrics/stream",
  });
  const secondResponse = await app.inject({
    method: "POST",
    payload: metric,
    url: "/metrics/stream",
  });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(firstResponse.json<{ accepted: boolean }>().accepted, true);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondResponse.json<{ accepted: boolean }>().accepted, false);
  assert.equal(db.metrics.length, 1);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/metrics/stream/recent",
  });
  assert.equal(recentResponse.statusCode, 200);
  assert.equal(recentResponse.json<{ metrics: unknown[] }>().metrics.length, 1);
  await app.close();
});

test("stream metrics reject oversized session ids and stale timestamps", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);
  const metric = {
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3,
    packetsLost: 0,
    sessionId: "s".repeat(129),
    timestamp: new Date().toISOString(),
  };

  const oversized = await app.inject({
    method: "POST",
    payload: metric,
    url: "/metrics/stream",
  });
  const stale = await app.inject({
    method: "POST",
    payload: {
      ...metric,
      sessionId: "stale-session",
      timestamp: "2020-01-01T00:00:00.000Z",
    },
    url: "/metrics/stream",
  });

  assert.equal(oversized.statusCode, 400);
  assert.equal(stale.statusCode, 400);
  assert.equal(db.metrics.length, 0);
  await app.close();
});

