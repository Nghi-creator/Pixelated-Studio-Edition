import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerSessionRoutes } from "../../src/modules/auth/http/sessionRoutes.js";
import {
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  USER_ID,
  createTestApp,
  requireUser,
  seedPublishedGame,
} from "./support/controlPlaneTestHarness.js";

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

test("sessions reject oversized client-provided session ids", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "fallback.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: {
      clientSessionId: "s".repeat(81),
      gameId: GAME_ID,
      mode: "cloud",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.sessions.size, 0);
  await app.close();
});

test("anonymous users can create User Edition WASM cloud sessions", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "public.gb",
    rom_url:
      "https://pxksbsloksyfwiqyfkrz.supabase.co/storage/v1/object/public/catalog_roms/public.gb",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = "public.gb";
    build.platform_id = "gb";
    build.runtime_id = "mgba";
  }
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    attachOptionalUser: async () => undefined,
    signCatalogRom: async () => "https://signed.example.test/public.gb",
    supabase: db as never,
  });

  const createResponse = await app.inject({
    method: "POST",
    payload: {
      clientEdition: "user",
      clientSessionId: "anonymous-session",
      gameId: GAME_ID,
      mode: "cloud",
      runtimeKind: "wasm",
    },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    boot: { romUrl: string };
    sessionToken: string;
    user: { id: string | null };
  }>();
  assert.equal(
    created.boot.romUrl,
    "https://signed.example.test/public.gb",
  );
  assert.equal(created.user.id, null);
  assert.equal(db.sessions.get("anonymous-session")?.user_id, null);
  assert.equal(db.sessions.get("anonymous-session")?.client_edition, "user");
  assert.equal(db.sessions.get("anonymous-session")?.client_runtime_kind, "wasm");

  const stopResponse = await app.inject({
    method: "DELETE",
    payload: { sessionToken: created.sessionToken },
    url: "/sessions/anonymous-session",
  });
  assert.equal(stopResponse.statusCode, 204);
  assert.equal(typeof db.sessions.get("anonymous-session")?.deleted_at, "string");
  await app.close();
});

test("unauthenticated clients cannot create Studio or non-WASM sessions", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.nes",
    rom_url:
      "https://pxksbsloksyfwiqyfkrz.supabase.co/storage/v1/object/public/catalog_roms/game.nes",
  });
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    attachOptionalUser: async () => undefined,
    supabase: db as never,
  });

  for (const payload of [
    {
      clientEdition: "studio",
      clientSessionId: "anonymous-studio",
      gameId: GAME_ID,
      mode: "cloud",
      runtimeKind: "webrtc",
    },
    {
      clientEdition: "user",
      clientSessionId: "anonymous-native",
      gameId: GAME_ID,
      mode: "cloud",
      runtimeKind: "native",
    },
  ]) {
    const response = await app.inject({
      method: "POST",
      payload,
      url: "/sessions",
    });
    assert.equal(response.statusCode, 401);
  }

  assert.equal(db.sessions.size, 0);
  await app.close();
});

test("anonymous Supabase users can create rate-limited Studio sessions", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "guest-game.nes",
    rom_url:
      "https://pxksbsloksyfwiqyfkrz.supabase.co/storage/v1/object/public/catalog_roms/guest-game.nes",
  });
  let anonymousIpChecks = 0;
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    anonymousSessionCreateIpLimiter: {
      consume: async () => {
        anonymousIpChecks += 1;
        return { allowed: true, remaining: 9, resetAt: Date.now() + 60_000 };
      },
    },
    attachOptionalUser: requireUser(USER_ID, true),
    requireSessionUser: requireUser(USER_ID, true),
    signCatalogRom: async () => "https://signed.example.test/guest-game.nes",
    supabase: db as never,
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      clientEdition: "studio",
      clientSessionId: "anonymous-studio-session",
      gameId: GAME_ID,
      mode: "cloud",
      runtimeKind: "webrtc",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(anonymousIpChecks, 1);
  assert.equal(
    response.json<{ boot: { romUrl: string } }>().boot.romUrl,
    "https://signed.example.test/guest-game.nes",
  );
  assert.deepEqual(response.json<{ user: unknown }>().user, {
    id: USER_ID,
    isAnonymous: true,
  });
  assert.equal(db.sessions.get("anonymous-studio-session")?.user_id, USER_ID);

  const lookupResponse = await app.inject({
    method: "GET",
    url: "/sessions/anonymous-studio-session",
  });
  assert.equal(lookupResponse.statusCode, 200);
  await app.close();
});

test("anonymous Studio sessions are limited by client IP", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "guest-game.nes",
    rom_url:
      "https://pxksbsloksyfwiqyfkrz.supabase.co/storage/v1/object/public/catalog_roms/guest-game.nes",
  });
  const app = Fastify({ logger: false });
  await registerSessionRoutes(app, {
    anonymousSessionCreateIpLimiter: {
      consume: async () => ({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
      }),
    },
    attachOptionalUser: requireUser(USER_ID, true),
    supabase: db as never,
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      clientEdition: "studio",
      clientSessionId: "rate-limited-anonymous-studio",
      gameId: GAME_ID,
      mode: "cloud",
      runtimeKind: "webrtc",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 429);
  assert.equal(db.sessions.size, 0);
  await app.close();
});

test("native Linux sessions persist launch manifests without ROM targets", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "native-placeholder",
    rom_url: null,
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = null;
    build.artifact_sha256 = null;
    build.artifact_size = null;
    build.artifact_url = null;
    build.launch_manifest_id = "frozen-bubble";
    build.platform_id = "linux";
    build.runtime_id = "debian-native-v1";
    build.runtime_kind = "native_linux";
  }
  const app = await createTestApp(db);

  const createResponse = await app.inject({
    method: "POST",
    payload: { clientSessionId: "native-session-1", gameId: GAME_ID, mode: "cloud" },
    url: "/sessions",
  });

  assert.equal(createResponse.statusCode, 200);
  const created = createResponse.json<{
    boot: { launchManifestId: string; romUrl: string | null };
    sessionId: string;
    sessionToken: string;
  }>();
  assert.equal(created.boot.launchManifestId, "frozen-bubble");
  assert.equal(created.boot.romUrl, null);
  assert.equal(
    createResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "native_linux",
  );

  const verifyResponse = await app.inject({
    method: "POST",
    payload: { sessionToken: created.sessionToken },
    url: `/sessions/${created.sessionId}/verify`,
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(
    verifyResponse.json<{ boot: { launchManifestId: string } }>().boot
      .launchManifestId,
    "frozen-bubble",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeId: string } }>().boot.runtimeId,
    "debian-native-v1",
  );
  assert.equal(
    verifyResponse.json<{ boot: { runtimeKind: string } }>().boot.runtimeKind,
    "native_linux",
  );
  await app.close();
});

test("session creation rejects unbootable libretro build metadata", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.gba",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.gba",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_sha256 = null;
    build.platform_id = "nes";
    build.runtime_id = "mesen";
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "bad-build-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /extension .gba/);
  assert.equal(db.sessions.has("bad-build-session"), false);
  await app.close();
});

test("session creation requires immutable libretro artifact evidence", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.nes",
    rom_url: "https://pxksbsloksyfwiqyfkrz.supabase.co/game.nes",
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_sha256 = null;
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "missing-evidence-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /checksum/);
  assert.equal(db.sessions.has("missing-evidence-session"), false);
  await app.close();
});

test("session creation rejects native builds outside the manifest contract", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "native-placeholder",
    rom_url: null,
  });
  const build = db.gameBuilds.get(`${GAME_ID}-build`);
  if (build) {
    build.artifact_filename = null;
    build.artifact_sha256 = null;
    build.artifact_size = null;
    build.artifact_url = null;
    build.launch_manifest_id = "unknown-game";
    build.platform_id = "linux";
    build.runtime_id = "debian-native-v1";
    build.runtime_kind = "native_linux";
  }
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "bad-native-session", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.json<{ error: string }>().error, /native runtime/);
  assert.equal(db.sessions.has("bad-native-session"), false);
  await app.close();
});

test("session creation rejects games without verified rights", async () => {
  const db = new FakeSupabase();
  db.games.set(GAME_ID, {
    id: GAME_ID,
    publication_status: "published",
    rom_filename: "unreviewed.nes",
  });
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { clientSessionId: "session-unreviewed", gameId: GAME_ID },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 404);
  assert.equal(db.sessions.has("session-unreviewed"), false);
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

test("session creation cannot overwrite another user's active session", async () => {
  const db = new FakeSupabase();
  seedPublishedGame(db, {
    id: GAME_ID,
    rom_filename: "game.nes",
    rom_url: null,
  });
  db.sessions.set("shared-session", {
    boot_rom_filename: "original.nes",
    boot_rom_url: null,
    deleted_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    game_id: GAME_ID,
    id: "shared-session",
    mode: "cloud",
    session_token_hash: "original-hash",
    user_id: OTHER_USER_ID,
  });
  const app = await createTestApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      clientSessionId: "shared-session",
      gameId: GAME_ID,
      mode: "cloud",
    },
    url: "/sessions",
  });

  assert.equal(response.statusCode, 409);
  assert.equal(db.sessions.get("shared-session")?.user_id, OTHER_USER_ID);
  assert.equal(
    db.sessions.get("shared-session")?.session_token_hash,
    "original-hash",
  );
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
