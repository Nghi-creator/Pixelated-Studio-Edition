import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ID,
  COMMENT_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  seedProfiles,
  USER_ID,
} from "./dataBoundarySupport.js";

test("comment delete is scoped to owner unless actor is admin", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "owned by somebody else",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });

  const userApp = await createDataBoundaryApp(db, USER_ID);
  const deniedDelete = await userApp.inject({
    method: "DELETE",
    url: `/comments/${COMMENT_ID}`,
  });
  assert.equal(deniedDelete.statusCode, 204);
  assert.equal(db.rows.comments.length, 1);
  await userApp.close();

  const adminApp = await createDataBoundaryApp(db, ADMIN_ID);
  const adminDelete = await adminApp.inject({
    method: "DELETE",
    url: `/comments/${COMMENT_ID}`,
  });
  assert.equal(adminDelete.statusCode, 204);
  assert.equal(db.rows.comments.length, 0);
  await adminApp.close();
});

test("game reactions replace atomically and preserve prior state on failure", async () => {
  const db = new FakeSupabase();
  db.rows.likes.push({
    game_id: GAME_ID,
    is_like: false,
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.likes.length, 1);
  assert.equal(db.rows.likes[0]?.is_like, true);

  db.rpcErrors.set("set_game_reaction", new Error("atomic write failed"));
  const failedResponse = await app.inject({
    method: "PUT",
    payload: { isLike: false },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(failedResponse.statusCode, 500);
  assert.equal(db.rows.likes.length, 1);
  assert.equal(db.rows.likes[0]?.is_like, true);
  await app.close();
});

test("comment reactions reject self-reactions and replace atomically", async () => {
  const db = new FakeSupabase();
  db.rows.comments.push({
    content: "hello",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  db.rows.comment_likes.push({
    comment_id: COMMENT_ID,
    is_like: false,
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.comment_likes.length, 1);
  assert.equal(db.rows.comment_likes[0]?.is_like, true);

  db.rpcErrors.set("set_comment_reaction", new Error("atomic write failed"));
  const failedResponse = await app.inject({
    method: "PUT",
    payload: { isLike: false },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(failedResponse.statusCode, 500);
  assert.equal(db.rows.comment_likes.length, 1);
  assert.equal(db.rows.comment_likes[0]?.is_like, true);
  db.rpcErrors.delete("set_comment_reaction");

  const selfApp = await createDataBoundaryApp(db, OTHER_USER_ID);
  const selfResponse = await selfApp.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/comments/${COMMENT_ID}/reaction`,
  });
  assert.equal(selfResponse.statusCode, 403);
  await app.close();
  await selfApp.close();
});

test("comments use one-based pagination with configurable page size", async () => {
  const db = new FakeSupabase();
  for (let index = 0; index < 5; index += 1) {
    db.rows.comments.push({
      content: `comment ${index}`,
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      game_id: GAME_ID,
      id: `66666666-6666-4666-8666-66666666666${index}`,
      user_id: USER_ID,
    });
  }
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=1&pageSize=2`,
  });
  assert.equal(firstResponse.statusCode, 200);
  assert.deepEqual(
    firstResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 4", "comment 3"],
  );
  assert.equal(
    firstResponse.json<{ hasMore: boolean }>().hasMore,
    true,
  );

  const secondResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=2&pageSize=2`,
  });
  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(
    secondResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 2", "comment 1"],
  );
  assert.equal(secondResponse.json<{ hasMore: boolean }>().hasMore, true);

  const thirdResponse = await app.inject({
    method: "GET",
    url: `/games/${GAME_ID}/comments?page=3&pageSize=2`,
  });
  assert.equal(thirdResponse.statusCode, 200);
  assert.deepEqual(
    thirdResponse
      .json<{ comments: { content: string }[]; hasMore: boolean }>()
      .comments.map((comment) => comment.content),
    ["comment 0"],
  );
  assert.equal(thirdResponse.json<{ hasMore: boolean }>().hasMore, false);
  await app.close();
});

test("write-heavy social and play routes are rate limited per user", async () => {
  const commentsDb = new FakeSupabase();
  const commentsApp = await createDataBoundaryApp(commentsDb, USER_ID);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await commentsApp.inject({
      method: "POST",
      payload: { content: `comment ${attempt}` },
      url: `/games/${GAME_ID}/comments`,
    });
    assert.equal(response.statusCode, 201);
  }
  const blockedComment = await commentsApp.inject({
    method: "POST",
    payload: { content: "blocked comment" },
    url: `/games/${GAME_ID}/comments`,
  });
  assert.equal(blockedComment.statusCode, 429);
  assert.equal(commentsDb.rows.comments.length, 10);
  await commentsApp.close();

  const reportsDb = new FakeSupabase();
  const reportsApp = await createDataBoundaryApp(reportsDb, USER_ID);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await reportsApp.inject({
      method: "POST",
      payload: { reason: `report ${attempt}` },
      url: `/moderation/comments/${COMMENT_ID}/report`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedReport = await reportsApp.inject({
    method: "POST",
    payload: { reason: "blocked report" },
    url: `/moderation/comments/${COMMENT_ID}/report`,
  });
  assert.equal(blockedReport.statusCode, 429);
  assert.equal(reportsDb.rows.reported_comments.length, 10);
  await reportsApp.close();

  const reactionsDb = new FakeSupabase();
  const reactionsApp = await createDataBoundaryApp(reactionsDb, USER_ID);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await reactionsApp.inject({
      method: "PUT",
      payload: { isLike: attempt % 2 === 0 },
      url: `/games/${GAME_ID}/reaction`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedReaction = await reactionsApp.inject({
    method: "PUT",
    payload: { isLike: true },
    url: `/games/${GAME_ID}/reaction`,
  });
  assert.equal(blockedReaction.statusCode, 429);
  assert.equal(
    reactionsDb.rpcCalls.filter((call) => call.fn === "set_game_reaction").length,
    120,
  );
  await reactionsApp.close();

  const playsDb = new FakeSupabase();
  const playsApp = await createDataBoundaryApp(playsDb, USER_ID);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await playsApp.inject({
      method: "POST",
      payload: {
        clientEdition: "studio",
        playEventId: `play_${String(attempt).padStart(16, "0")}`,
        runtimeKind: "webrtc",
      },
      url: `/games/${GAME_ID}/play-count`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedPlay = await playsApp.inject({
    method: "POST",
    payload: {
      clientEdition: "studio",
      playEventId: "play_blocked00000000",
      runtimeKind: "webrtc",
    },
    url: `/games/${GAME_ID}/play-count`,
  });
  assert.equal(blockedPlay.statusCode, 429);
  assert.equal(
    playsDb.rpcCalls.filter((call) => call.fn === "record_game_play").length,
    60,
  );
  await playsApp.close();
});

test("play activity requires a matching live backend session", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID, undefined, {
    hasLivePlaySession: async () => false,
  });

  const response = await app.inject({
    method: "POST",
    payload: {
      clientEdition: "user",
      playEventId: "play_without_session_01",
      runtimeKind: "wasm",
    },
    url: `/games/${GAME_ID}/play-count`,
  });

  assert.equal(response.statusCode, 409);
  assert.equal(
    db.rpcCalls.some((call) => call.fn === "record_game_play"),
    false,
  );
  await app.close();
});

