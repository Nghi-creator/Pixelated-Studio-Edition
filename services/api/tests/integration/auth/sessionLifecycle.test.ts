import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerSessionRoutes } from "../../../src/modules/auth/http/sessionRoutes.js";
import {
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  USER_ID,
  createTestApp,
  requireUser,
  seedPublishedGame,
} from "../support/controlPlaneTestHarness.js";

test("sessions persist hashed tokens and verify approved boot targets", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "fallback.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_size = 1234;
    build.artifact_sha256 =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  }
  const app = await createTestApp(db);

  const createResponse = await app.inject({
    method: "POST",
    payload: { clientSessionId: "session-1", gameId: GAME_ID, mode: "cloud" },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    sessionId: string;
    sessionToken: string;
  }>();
  const storedSession = db.sessions.get("session-1");
  assert.ok(storedSession);
  assert.equal(storedSession.session_token_hash === created.sessionToken, false);
  assert.equal(storedSession.browser_core_id, null);
  assert.equal(storedSession.browser_system_id, null);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: created.sessionToken },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(
    verifyResponse.json<{ boot: { romUrl: string } }>().boot.romUrl,
    "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeId: string } }>().boot.runtimeId,
    "mesen",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "libretro",
  );
  assert.equal(
    verifyResponse.json<{ boot: { artifactSize: number } }>().boot.artifactSize,
    1234,
  );
  assert.equal(
    verifyResponse.json<{ boot: { artifactSha256: string } }>().boot.artifactSha256,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );

  const badVerifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-not-the-token" },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(badVerifyResponse.statusCode, 401);
  await app.close();
});

test("session ownership protects authenticated lookup", async () => {
  const db = new FakeSupabase();
  db.sessions.set("session-owned", {
    boot_rom_filename: "game.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "session-owned",
    mode: "cloud",
    session_token_hash: "hash",
    user_id: OTHER_USER_ID,
  });
  const app = await createTestApp(db, USER_ID);

  const response = await app.inject({
    method: "GET",
    url: "/sessions/session-owned",
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test("session lookup and verification report missing service configuration", async () => {
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    requireSessionUser: requireUser(USER_ID),
    requireUser: requireUser(USER_ID),
    supabase: null,
  });

  const lookupResponse = await app.inject({
    method: "GET",
    url: "/sessions/session-owned",
  });
  assert.equal(lookupResponse.statusCode, 503);

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-long-enough-token" },
    url: "/sessions/session-owned/verify",
  });
  assert.equal(verifyResponse.statusCode, 503);
  await app.close();
});

test("session token verification is rate limited", async () => {
  const db = new FakeSupabase();
  db.sessions.set("rate-limited-session", {
    boot_rom_filename: "game.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "rate-limited-session",
    mode: "cloud",
    session_token_hash: "not-a-valid-sha256-hash",
    user_id: USER_ID,
  });
  const app = await createTestApp(db);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: "POST",
      payload: { sessionToken: "definitely-not-the-token" },
      url: "/sessions/rate-limited-session/verify",
    });
    assert.equal(response.statusCode, 401);
  }

  const blockedResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: "definitely-not-the-token" },
    url: "/sessions/rate-limited-session/verify",
  });
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers["retry-after"], "60");
  await app.close();
});
