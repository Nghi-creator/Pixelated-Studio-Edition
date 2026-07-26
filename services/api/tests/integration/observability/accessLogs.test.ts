import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import {
  ADMIN_ID,
  createDataBoundaryApp,
  FakeSupabase,
  OTHER_USER_ID,
  seedProfiles,
  USER_ID,
} from "../support/dataBoundarySupport.js";

type TestRequest = FastifyRequest & {
  user?: User;
};

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
