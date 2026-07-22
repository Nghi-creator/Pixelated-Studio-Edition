import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import Fastify, { type FastifyRequest } from "fastify";
import { registerProfileRoutes } from "../../src/modules/users/http/profileRoutes.js";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  OTHER_USER_ID,
  seedProfiles,
  SUPER_ADMIN_ID,
  USER_ID,
} from "./dataBoundarySupport.js";

type TestRequest = FastifyRequest & {
  user?: User;
};

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

test("profile activity returns only the authenticated user's recent games", async () => {
  const db = new FakeSupabase();
  db.rows.games.push({ cover_url: "/tiny.png", id: GAME_ID, title: "Tiny Quest" });
  db.rows.user_game_activity.push(
    {
      client_edition: "user",
      game_id: GAME_ID,
      last_played_at: "2026-07-16T12:00:00.000Z",
      play_count: 3,
      runtime_kind: "wasm",
      user_id: USER_ID,
    },
    {
      client_edition: "studio",
      game_id: GAME_ID,
      last_played_at: "2026-07-16T13:00:00.000Z",
      play_count: 9,
      runtime_kind: "webrtc",
      user_id: OTHER_USER_ID,
    },
  );
  const app = await createDataBoundaryApp(db, USER_ID);

  const response = await app.inject({
    method: "GET",
    url: "/profile/activity?limit=8",
  });

  assert.equal(response.statusCode, 200);
  const activity = response.json<{ activity: Record<string, unknown>[] }>().activity;
  assert.equal(activity.length, 1);
  assert.equal(activity[0]?.client_edition, "user");
  assert.equal(
    (activity[0]?.game as Record<string, unknown>)?.title,
    "Tiny Quest",
  );
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
  const anonymousOverwrite = await app.inject({
    method: "POST",
    payload: { path: "/poisoned", sessionId: "browser-session-1" },
    url: "/access-logs",
  });

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(anonymousOverwrite.statusCode, 202);
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

