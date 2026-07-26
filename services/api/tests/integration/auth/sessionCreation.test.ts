import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  USER_ID,
  createTestApp,
  seedPublishedGame,
} from "../support/controlPlaneTestHarness.js";

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
