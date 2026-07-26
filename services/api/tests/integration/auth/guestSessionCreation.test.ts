import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerSessionRoutes } from "../../../src/modules/auth/http/sessionRoutes.js";
import {
  FakeSupabase,
  GAME_ID,
  USER_ID,
  requireUser,
  seedPublishedGame,
} from "../support/controlPlaneTestHarness.js";

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
