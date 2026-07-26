import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  USER_ID,
} from "../support/dataBoundarySupport.js";

test("play counts are incremented through the backend RPC boundary", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "POST",
    payload: {
      clientEdition: "studio",
      playEventId: "play_1111111111111111",
      runtimeKind: "webrtc",
    },
    url: `/games/${GAME_ID}/play-count`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(db.rpcCalls, [
    {
      fn: "record_game_play",
      params: {
        p_client_edition: "studio",
        p_event_id: "play_1111111111111111",
        p_game_id: GAME_ID,
        p_runtime_kind: "webrtc",
        p_user_id: USER_ID,
      },
    },
  ]);
  await app.close();
});
