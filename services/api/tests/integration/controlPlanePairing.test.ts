import assert from "node:assert/strict";
import test from "node:test";
import {
  FakeSupabase,
  GAME_ID,
  USER_ID,
  createTestApp,
} from "./support/controlPlaneTestHarness.js";

test("local pairings are persisted, readable, and deletable", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const pairResponse = await app.inject({
    method: "POST",
    payload: { engineUrl: "http://localhost:8080/" },
    url: "/local-pairings",
  });

  assert.equal(pairResponse.statusCode, 200);
  assert.equal(
    pairResponse.json<{ pairing: { engineUrl: string } }>().pairing.engineUrl,
    "http://localhost:8080",
  );

  const getResponse = await app.inject({
    method: "GET",
    url: "/local-pairings/current",
  });
  assert.equal(getResponse.statusCode, 200);

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: "/local-pairings/current",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(db.pairings.has(USER_ID), false);
  await app.close();
});

test("local pairings reject non-http engine URLs", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const response = await app.inject({
    method: "POST",
    payload: { engineUrl: "ftp://localhost:8080" },
    url: "/local-pairings",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.pairings.size, 0);
  await app.close();
});

test("multiplayer lobbies persist metadata without storing engine tokens", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);

  const saveResponse = await app.inject({
    method: "PUT",
    payload: {
      engineUrl: "http://192.168.1.10:8080/",
      exposureMode: "lan",
      gameId: GAME_ID,
      maxPlayers: 4,
      participants: [
        { displayName: "Host", playerIndex: 1, role: "host" },
        { displayName: "Guest", playerIndex: null, role: "spectator" },
      ],
    },
    url: "/multiplayer/lobbies/session-1",
  });

  assert.equal(saveResponse.statusCode, 200);
  const storedLobby = db.multiplayerLobbies.get(`${USER_ID}:session-1`);
  assert.ok(storedLobby);
  assert.equal(storedLobby.engine_url, "http://192.168.1.10:8080");
  assert.equal("engine_token" in storedLobby, false);

  const recentResponse = await app.inject({
    method: "GET",
    url: "/multiplayer/lobbies/recent",
  });
  assert.equal(recentResponse.statusCode, 200);
  assert.equal(
    recentResponse.json<{ lobbies: unknown[] }>().lobbies.length,
    1,
  );

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: "/multiplayer/lobbies/session-1",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(
    db.multiplayerLobbies.get(`${USER_ID}:session-1`)?.status,
    "ended",
  );
  await app.close();
});

test("multiplayer lobbies reject unsafe engine URLs and oversized session ids", async () => {
  const db = new FakeSupabase();
  const app = await createTestApp(db);
  const lobbyPayload = {
    engineUrl: "javascript:alert(1)",
    exposureMode: "lan",
    gameId: GAME_ID,
    maxPlayers: 4,
    participants: [{ displayName: "Host", playerIndex: 1, role: "host" }],
  };

  const unsafeUrlResponse = await app.inject({
    method: "PUT",
    payload: lobbyPayload,
    url: "/multiplayer/lobbies/session-1",
  });
  const oversizedSessionResponse = await app.inject({
    method: "PUT",
    payload: {
      ...lobbyPayload,
      engineUrl: "http://192.168.1.10:8080",
    },
    url: `/multiplayer/lobbies/${"s".repeat(81)}`,
  });

  assert.equal(unsafeUrlResponse.statusCode, 400);
  assert.equal(oversizedSessionResponse.statusCode, 400);
  assert.equal(db.multiplayerLobbies.size, 0);
  await app.close();
});

