import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { env } from "../../../src/config/env.js";
import { registerCors } from "../../../src/plugins/cors.js";

test("session CORS permits hosted preflight and preserves readable auth errors", async t => {
  const app = Fastify();
  t.after(() => app.close());
  await registerCors(app);
  app.post("/sessions", async (_request, reply) => reply.code(401).send({ error: "Unauthorized" }));
  const origin = env.allowedOrigins[0];
  assert.ok(origin, "The API must configure at least one browser origin");
  const preflight = await app.inject({
    method: "OPTIONS", url: "/sessions", headers: {
      origin, "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], origin);
  assert.match(String(preflight.headers["access-control-allow-methods"]), /POST/);
  assert.match(String(preflight.headers["access-control-allow-headers"]), /authorization/);
  assert.match(String(preflight.headers["access-control-allow-headers"]), /content-type/);
  const denied = await app.inject({ method: "POST", url: "/sessions", headers: { origin }, payload: {} });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.headers["access-control-allow-origin"], origin);
  assert.deepEqual(denied.json(), { error: "Unauthorized" });
  const hostile = await app.inject({ method: "OPTIONS", url: "/sessions", headers: {
    origin: "https://attacker.invalid", "access-control-request-method": "POST",
    "access-control-request-headers": "authorization,content-type",
  } });
  assert.equal(hostile.headers["access-control-allow-origin"], undefined);
});
