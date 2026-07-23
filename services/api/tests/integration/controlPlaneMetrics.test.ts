import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSupabase,
  OTHER_USER_ID,
  USER_ID,
  createTestApp,
} from "./support/controlPlaneTestHarness.js";

test("stream metrics persist and rate-limit per user session", async () => {
  const db = new FakeSupabase();
  db.sessions.set("session-1", {
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    id: "session-1",
    user_id: USER_ID,
  });
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

test("stream metrics require live sessions and enforce a user-level backstop", async () => {
  const missingDb = new FakeSupabase();
  const missingApp = await createTestApp(missingDb);
  const metric = {
    bitrateKbps: 1200,
    connectionState: "connected",
    fps: 60,
    iceConnectionState: "connected",
    jitterMs: 3,
    packetsLost: 0,
    timestamp: new Date().toISOString(),
  };

  const missing = await missingApp.inject({
    method: "POST",
    payload: { ...metric, sessionId: "missing-session" },
    url: "/metrics/stream",
  });
  assert.equal(missing.statusCode, 404);
  await missingApp.close();

  const db = new FakeSupabase();
  const app = await createTestApp(db);

  for (let index = 0; index < 31; index += 1) {
    const sessionId = `metric-session-${index}`;
    db.sessions.set(sessionId, {
      deleted_at: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      id: sessionId,
      user_id: USER_ID,
    });
    const response = await app.inject({
      method: "POST",
      payload: { ...metric, sessionId },
      url: "/metrics/stream",
    });
    assert.equal(response.statusCode, 202);
    assert.equal(
      response.json<{ accepted: boolean }>().accepted,
      index < 30,
    );
  }
  assert.equal(db.metrics.length, 30);
  await app.close();
});

test("stream metrics reject live sessions owned by another user", async () => {
  const db = new FakeSupabase();
  db.sessions.set("other-user-session", {
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    id: "other-user-session",
    user_id: OTHER_USER_ID,
  });
  const app = await createTestApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      bitrateKbps: 1200,
      connectionState: "connected",
      fps: 60,
      iceConnectionState: "connected",
      jitterMs: 3,
      packetsLost: 0,
      sessionId: "other-user-session",
      timestamp: new Date().toISOString(),
    },
    url: "/metrics/stream",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(db.metrics.length, 0);
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
