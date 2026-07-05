import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerProfileRoutes } from "../../src/modules/users/http/profileRoutes.js";
import {
  ADMIN_ID,
  COMMENT_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  REPORT_ID,
  seedProfiles,
  SUPER_ADMIN_ID,
  USER_ID,
} from "./dataBoundarySupport.js";

test("public account discovery endpoint returns an enumeration-safe response", async () => {
  const db = new FakeSupabase();
  db.authUsers.push({
    app_metadata: { providers: ["google"] },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: "existing@example.com",
    id: USER_ID,
    user_metadata: {},
  });
  const app = await createDataBoundaryApp(db);

  const existingResponse = await app.inject({
    method: "POST",
    payload: { email: "existing@example.com" },
    url: "/auth/account-methods",
  });
  const missingResponse = await app.inject({
    method: "POST",
    payload: { email: "missing@example.com" },
    url: "/auth/account-methods",
  });

  assert.equal(existingResponse.statusCode, 200);
  assert.deepEqual(existingResponse.json(), missingResponse.json());
  assert.deepEqual(existingResponse.json(), {
    exists: false,
    hasEmailProvider: false,
    providers: [],
  });
  assert.equal(db.authListUsersCalls, 0);
  await app.close();
});

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
      url: `/games/${GAME_ID}/play-count`,
    });
    assert.equal(response.statusCode, 200);
  }
  const blockedPlay = await playsApp.inject({
    method: "POST",
    url: `/games/${GAME_ID}/play-count`,
  });
  assert.equal(blockedPlay.statusCode, 429);
  assert.equal(
    playsDb.rpcCalls.filter((call) => call.fn === "increment_play_count").length,
    60,
  );
  await playsApp.close();
});

test("profile routes update only the authenticated profile and safely delete auth user", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.storageObjects.avatars.push(`${USER_ID}/avatar.png`);
  db.storageObjects.submissions.push(
    `${USER_ID}/roms/tiny.nes`,
    `${USER_ID}/covers/cover.png`,
    `${OTHER_USER_ID}/roms/other.nes`,
  );
  const app = await createDataBoundaryApp(db, USER_ID);

  const updateResponse = await app.inject({
    method: "PATCH",
    payload: {
      avatarUrl: "https://example.com/avatar.png",
      username: "new-name",
    },
    url: "/profile",
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(db.rows.profiles.find((row) => row.id === USER_ID)?.username, "new-name");
  assert.equal(db.rows.profiles.find((row) => row.id === OTHER_USER_ID)?.username, "other");

  const deleteResponse = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.deepEqual(db.deletedUsers, [USER_ID]);
  assert.deepEqual(db.storageObjects.avatars, []);
  assert.deepEqual(db.storageObjects.submissions, [`${OTHER_USER_ID}/roms/other.nes`]);
  await app.close();
});

test("account deletion blocks privileged roles, stale sessions, and invalid confirmation", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);

  const invalidConfirmationApp = await createDataBoundaryApp(db, USER_ID);
  const invalidConfirmation = await invalidConfirmationApp.inject({
    method: "DELETE",
    payload: { confirmation: "delete" },
    url: "/me/account",
  });
  assert.equal(invalidConfirmation.statusCode, 400);
  await invalidConfirmationApp.close();

  for (const privilegedUserId of [ADMIN_ID, SUPER_ADMIN_ID]) {
    const privilegedApp = await createDataBoundaryApp(db, privilegedUserId);
    const privilegedDelete = await privilegedApp.inject({
      method: "DELETE",
      payload: { confirmation: "DELETE" },
      url: "/me/account",
    });
    assert.equal(privilegedDelete.statusCode, 403);
    assert.deepEqual(db.deletedUsers, []);
    await privilegedApp.close();
  }

  const staleApp = Fastify({ logger: false });
  await registerProfileRoutes(staleApp, {
    requireUser: async (request) => {
      (request as TestRequest).user = {
        app_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
        email: "stale@example.com",
        id: USER_ID,
        last_sign_in_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        user_metadata: {},
      };
    },
    supabase: db as never,
  });
  const staleDelete = await staleApp.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(staleDelete.statusCode, 403);
  assert.equal(
    staleDelete.json<{ code: string }>().code,
    "recent_sign_in_required",
  );
  assert.deepEqual(db.deletedUsers, []);
  await staleApp.close();
});

test("account deletion aborts when owned storage cannot be cleaned", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.storageErrors.add("submissions");
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(db.deletedUsers, []);
  await app.close();
});

test("account deletion attempts are rate limited", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const app = await createDataBoundaryApp(db, USER_ID);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await app.inject({
      method: "DELETE",
      payload: { confirmation: "not-delete" },
      url: "/me/account",
    });
    assert.equal(response.statusCode, 400);
  }

  const blockedResponse = await app.inject({
    method: "DELETE",
    payload: { confirmation: "DELETE" },
    url: "/me/account",
  });
  assert.equal(blockedResponse.statusCode, 429);
  assert.deepEqual(db.deletedUsers, []);
  await app.close();
});

test("admin user and access-log routes require privileged roles", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.access_logs.push({
    created_at: "2026-05-27T00:00:00.000Z",
    id: "log-1",
    path: "/",
    user_id: USER_ID,
  });

  const userApp = await createDataBoundaryApp(db, USER_ID);
  assert.equal(
    (await userApp.inject({ method: "GET", url: "/admin/users" })).statusCode,
    403,
  );
  assert.equal(
    (await userApp.inject({ method: "GET", url: "/admin/access-logs" })).statusCode,
    403,
  );
  await userApp.close();

  const superAdminApp = await createDataBoundaryApp(db, SUPER_ADMIN_ID);
  const usersResponse = await superAdminApp.inject({
    method: "GET",
    url: "/admin/users",
  });
  assert.equal(usersResponse.statusCode, 200);

  const updateResponse = await superAdminApp.inject({
    method: "PATCH",
    payload: { is_banned: true },
    url: `/admin/users/${USER_ID}`,
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(db.rows.profiles.find((row) => row.id === USER_ID)?.is_banned, true);

  const logsResponse = await createDataBoundaryApp(db, ADMIN_ID).then((app) =>
    app.inject({ method: "GET", url: "/admin/access-logs" }).finally(() => app.close()),
  );
  assert.equal(logsResponse.statusCode, 200);
  assert.equal(logsResponse.json<{ logs: unknown[]; total: number }>().logs.length, 1);
  assert.equal(logsResponse.json<{ logs: unknown[]; total: number }>().total, 1);
  await superAdminApp.close();
});

test("access logs upsert browser sessions", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.authUsers.push({
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    id: USER_ID,
    user_metadata: {},
  } as User);
  const app = await createDataBoundaryApp(db, USER_ID);

  const firstResponse = await app.inject({
    headers: { authorization: `Bearer ${USER_ID}` },
    method: "POST",
    payload: { path: "/", sessionId: "browser-session-1" },
    url: "/access-logs",
  });
  const secondResponse = await app.inject({
    headers: { authorization: `Bearer ${USER_ID}` },
    method: "POST",
    payload: { path: "/play/test-game", sessionId: "browser-session-1" },
    url: "/access-logs",
  });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(db.rows.access_logs.length, 1);
  assert.equal(db.rows.access_logs[0]?.session_id, "browser-session-1");
  assert.equal(db.rows.access_logs[0]?.path, "/play/test-game");
  assert.equal(db.rows.access_logs[0]?.access_count, 2);
  assert.equal(db.rows.access_logs[0]?.user_id, USER_ID);
  await app.close();
});

test("admin access logs summarize users and sessions server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 30; index += 1) {
    db.rows.access_logs.push({
      created_at: `2026-05-27T00:${String(index).padStart(2, "0")}:00.000Z`,
      id: `log-${index}`,
      last_seen_at: `2026-05-27T01:${String(index).padStart(2, "0")}:00.000Z`,
      path: `/page-${index}`,
      session_id: `session-${index}`,
      user_id:
        index <= 12 ? USER_ID : index <= 20 ? OTHER_USER_ID : null,
    });
  }
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/access-logs?page=1&pageSize=10",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    logs: {
      sessions_count: number;
      user_id: string | null;
      username: string | null;
    }[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>();
  assert.equal(body.logs.length, 3);
  assert.equal(body.logs[0]?.user_id, null);
  assert.equal(body.logs[0]?.sessions_count, 10);
  assert.equal(body.logs[1]?.user_id, OTHER_USER_ID);
  assert.equal(body.logs[1]?.sessions_count, 8);
  assert.equal(body.logs[2]?.username, "player");
  assert.equal(body.logs[2]?.sessions_count, 12);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 10);
  assert.equal(body.total, 3);
  assert.equal(body.totalPages, 1);
  await app.close();
});

test("admin users are paginated and searchable server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 30; index += 1) {
    db.rows.profiles.push({
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
      is_banned: false,
      role: "user",
      username: index % 2 === 0 ? `player-${index}` : `viewer-${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/users?page=2&pageSize=5&search=player-",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    users: { username: string }[];
  }>();
  assert.equal(body.users.length, 5);
  assert.deepEqual(
    body.users.map((user) => user.username),
    ["player-20", "player-18", "player-16", "player-14", "player-12"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 5);
  assert.equal(body.total, 15);
  assert.equal(body.totalPages, 3);
  await app.close();
});

test("me permissions are loaded from backend-owned profile state", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  Object.assign(db.rows.profiles.find((row) => row.id === ADMIN_ID) || {}, {
    avatar_url: "https://example.com/avatar.png",
    email: "admin@example.com",
    is_banned: false,
    is_developer: true,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({ method: "GET", url: "/me/permissions" });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json<{ abilities: { canAccessAdmin: boolean } }>().abilities
      .canAccessAdmin,
    true,
  );
  assert.equal(
    response.json<{ profile: { username: string } }>().profile.username,
    "admin",
  );
  await app.close();
});

test("moderation reports are created and resolved through admin routes", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "needs review",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  const app = await createDataBoundaryApp(db, USER_ID);

  const reportResponse = await app.inject({
    method: "POST",
    payload: { reason: "Spoiler in the comments" },
    url: `/moderation/comments/${COMMENT_ID}/report`,
  });
  assert.equal(reportResponse.statusCode, 200);
  assert.equal(db.rows.reported_comments.length, 1);

  db.rows.reported_comments[0] = {
    ...db.rows.reported_comments[0],
    id: REPORT_ID,
  };
  await app.close();

  const adminApp = await createDataBoundaryApp(db, ADMIN_ID);
  const reportsResponse = await adminApp.inject({
    method: "GET",
    url: "/admin/reports",
  });
  assert.equal(reportsResponse.statusCode, 200);
  assert.equal(reportsResponse.json<{ reports: unknown[] }>().reports.length, 1);

  const actionResponse = await adminApp.inject({
    method: "POST",
    payload: { action: "delete_comment" },
    url: `/admin/reports/${REPORT_ID}/action`,
  });
  assert.equal(actionResponse.statusCode, 200);
  assert.equal(db.rows.comments.length, 0);
  await adminApp.close();
});

test("admin reports are paginated server-side", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 12; index += 1) {
    db.rows.reported_comments.push({
      comments: {
        content: `reported comment ${index}`,
        id: `comment-${index}`,
        profiles: { id: USER_ID, role: "user", username: "player" },
      },
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `report-${index}`,
      profiles: { id: OTHER_USER_ID, username: "other" },
      reason: `reason ${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "GET",
    url: "/admin/reports?page=2&pageSize=5",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    page: number;
    pageSize: number;
    reports: { id: string }[];
    total: number;
    totalPages: number;
  }>();
  assert.deepEqual(
    body.reports.map((report) => report.id),
    ["report-7", "report-6", "report-5", "report-4", "report-3"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 5);
  assert.equal(body.total, 12);
  assert.equal(body.totalPages, 3);
  await app.close();
});

test("admin reports filter target roles before pagination", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  for (let index = 1; index <= 8; index += 1) {
    const isAdminTarget = index % 2 === 0;
    db.rows.reported_comments.push({
      comments: {
        content: `reported comment ${index}`,
        id: `comment-${index}`,
        profiles: {
          id: isAdminTarget ? ADMIN_ID : USER_ID,
          role: isAdminTarget ? "admin" : "user",
          username: isAdminTarget ? "admin" : "player",
        },
      },
      created_at: `2026-05-${String(index).padStart(2, "0")}T00:00:00.000Z`,
      id: `report-${index}`,
      profiles: { id: OTHER_USER_ID, username: "other" },
      reason: `reason ${index}`,
    });
  }
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);

  const adminResponse = await app.inject({
    method: "GET",
    url: "/admin/reports?page=1&pageSize=2&targetRole=admins",
  });
  const userResponse = await app.inject({
    method: "GET",
    url: "/admin/reports?page=2&pageSize=2&targetRole=users",
  });

  assert.equal(adminResponse.statusCode, 200);
  assert.deepEqual(
    adminResponse.json<{ reports: { id: string }[]; total: number; totalPages: number }>()
      .reports.map((report) => report.id),
    ["report-8", "report-6"],
  );
  assert.equal(adminResponse.json<{ total: number }>().total, 4);
  assert.equal(adminResponse.json<{ totalPages: number }>().totalPages, 2);

  assert.equal(userResponse.statusCode, 200);
  assert.deepEqual(
    userResponse.json<{ reports: { id: string }[]; total: number; totalPages: number }>()
      .reports.map((report) => report.id),
    ["report-3", "report-1"],
  );
  assert.equal(userResponse.json<{ total: number }>().total, 4);
  assert.equal(userResponse.json<{ totalPages: number }>().totalPages, 2);
  await app.close();
});

