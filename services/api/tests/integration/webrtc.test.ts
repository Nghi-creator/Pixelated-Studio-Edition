import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { registerWebRTCRoutes, testExports } from "../../src/modules/multiplayer/http/webrtcRoutes.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function requireUser() {
  return async (request: FastifyRequest) => {
    request.user = {
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      id: USER_ID,
      user_metadata: {},
    };
    return undefined;
  };
}

test("webrtc ice route returns default STUN config", async () => {
  const app = Fastify({ logger: false });
  await registerWebRTCRoutes(app, { requireUser: requireUser() });

  const response = await app.inject({
    method: "GET",
    url: "/webrtc/ice-servers",
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json<{
    iceServers: { urls: string | string[] }[];
    ttlSeconds: number;
  }>();
  assert.equal(payload.iceServers.length, 1);
  assert.equal(payload.iceServers[0]?.urls, "stun:stun.l.google.com:19302");
  assert.equal(payload.ttlSeconds, 3600);
  await app.close();
});

test("turn credentials use coturn REST shared-secret format", () => {
  const username = "1770000000:user-1";
  const secret = "shared-secret";
  const expected = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  assert.equal(testExports.createTurnCredential(username, secret), expected);
});
