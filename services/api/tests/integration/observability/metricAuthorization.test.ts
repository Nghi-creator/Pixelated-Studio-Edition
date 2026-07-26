import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  OTHER_USER_ID,
  USER_ID,
} from "../support/dataBoundarySupport.js";

test("stream metrics are written and read only for the authenticated user", async () => {
  const db = new FakeSupabase();
  db.rows.stream_metrics.push({
    bitrate_kbps: 900,
    connection_state: "connected",
    fps: 30,
    ice_connection_state: "connected",
    jitter_ms: 5,
    metric_timestamp: "2026-05-27T12:00:00.000Z",
    packets_lost: 1,
    received_at: "2026-05-27T12:00:00.000Z",
    session_id: "other-session",
    user_id: OTHER_USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      bitrateKbps: 1200,
      connectionState: "connected",
      fps: 60,
      iceConnectionState: "connected",
      jitterMs: 3,
      packetsLost: 0,
      sessionId: "session-1",
      timestamp: new Date().toISOString(),
    },
    url: "/metrics/stream",
  });
  assert.equal(response.statusCode, 202);
  assert.equal(response.json<{ accepted: boolean }>().accepted, true);
  assert.equal(db.rows.stream_metrics.length, 2);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/metrics/stream/recent",
  });
  const metrics = recentResponse.json<{ metrics: { sessionId: string }[] }>().metrics;
  assert.equal(recentResponse.statusCode, 200);
  assert.deepEqual(metrics.map((metric) => metric.sessionId), ["session-1"]);
  await app.close();
});
