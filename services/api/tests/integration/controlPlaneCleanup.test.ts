import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { cleanupControlPlaneState } from "../../src/modules/maintenance/controlPlaneCleanup.js";
import { FakeSupabase } from "./support/controlPlaneTestHarness.js";

test("control-plane cleanup removes expired sessions and old metrics", async () => {
  const db = new FakeSupabase();
  const app = Fastify({ logger: false });
  const now = new Date("2026-05-27T12:00:00.000Z");
  db.sessions.set("expired", {
    expires_at: "2026-05-27T11:59:00.000Z",
    id: "expired",
  });
  db.sessions.set("deleted", {
    deleted_at: "2026-05-27T11:58:00.000Z",
    expires_at: "2026-05-27T12:15:00.000Z",
    id: "deleted",
  });
  db.sessions.set("active", {
    deleted_at: null,
    expires_at: "2026-05-27T12:15:00.000Z",
    id: "active",
  });
  db.metrics.push(
    { received_at: "2026-05-20T11:59:00.000Z" },
    { received_at: "2026-05-27T11:59:00.000Z" },
  );

  await cleanupControlPlaneState(app, {
    metricRetentionDays: 7,
    now,
    supabase: db as never,
  });

  assert.equal(db.sessions.has("expired"), false);
  assert.equal(db.sessions.has("deleted"), false);
  assert.equal(db.sessions.has("active"), true);
  assert.equal(db.metrics.length, 1);
  await app.close();
});

