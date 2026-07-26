import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSupabase,
  GAME_ID,
  createTestApp,
  seedPublishedGame,
} from "../support/controlPlaneTestHarness.js";

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
