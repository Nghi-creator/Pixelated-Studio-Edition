import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  seedProfiles,
  SUPER_ADMIN_ID,
  USER_ID,
} from "../support/dataBoundarySupport.js";

type TestRequest = FastifyRequest & {
  user?: User;
};

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

test("demoted administrators lose access on the next request", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);

  const authorized = await app.inject({
    method: "GET",
    url: "/admin/users",
  });
  assert.equal(authorized.statusCode, 200);

  Object.assign(
    db.rows.profiles.find((row) => row.id === SUPER_ADMIN_ID) || {},
    { role: "user" },
  );

  const demoted = await app.inject({
    method: "GET",
    url: "/admin/users",
  });
  assert.equal(demoted.statusCode, 403);
  await app.close();
});
