import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerHealthRoutes } from "../../../src/modules/system/http/healthRoutes.js";

const configured = {
  sharedRateLimitStoreConfigured: true,
  sharedRateLimitStoreRequired: true,
  supabaseConfigured: true,
  webOriginsConfigured: true,
};

test("readiness succeeds only when configured dependencies respond", async () => {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app, {
    checkRateLimitStore: async () => true,
    checkSupabase: async () => true,
    configuration: configured,
  });

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ ok: boolean }>().ok, true);
  await app.close();
});

test("readiness reports a live Supabase outage", async () => {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app, {
    checkRateLimitStore: async () => true,
    checkSupabase: async () => false,
    configuration: configured,
  });

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(
    response.json<{ checks: Record<string, boolean> }>().checks,
    {
      sharedRateLimitStoreConfigured: true,
      sharedRateLimitStoreReachable: true,
      supabaseConfigured: true,
      supabaseReachable: false,
      webOrigins: true,
    },
  );
  await app.close();
});

test("readiness reports a live shared rate-limit store outage", async () => {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app, {
    checkRateLimitStore: async () => false,
    checkSupabase: async () => true,
    configuration: configured,
  });

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(
    response.json<{ checks: Record<string, boolean> }>().checks
      .sharedRateLimitStoreReachable,
    false,
  );
  await app.close();
});
