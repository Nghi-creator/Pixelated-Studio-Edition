import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(db.rpcCalls.at(-1)?.fn, "resolve_comment_report");
  await adminApp.close();
});

test("ban report resolution is atomic when its database operation fails", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "needs review",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  db.rows.reported_comments.push({
    comment_id: COMMENT_ID,
    id: REPORT_ID,
    reporter_id: USER_ID,
  });
  db.rpcErrors.set(
    "resolve_comment_report",
    new Error("atomic report resolution failed"),
  );
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "POST",
    payload: { action: "ban_user" },
    url: `/admin/reports/${REPORT_ID}/action`,
  });

  assert.equal(response.statusCode, 500);
  assert.equal(db.rows.comments.length, 1);
  assert.equal(
    db.rows.profiles.find((profile) => profile.id === OTHER_USER_ID)?.is_banned ??
      false,
    false,
  );
  await app.close();
});

test("ban report resolution updates the target and removes its comment together", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  db.rows.comments.push({
    content: "needs review",
    game_id: GAME_ID,
    id: COMMENT_ID,
    user_id: OTHER_USER_ID,
  });
  db.rows.reported_comments.push({
    comment_id: COMMENT_ID,
    id: REPORT_ID,
    reporter_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db, ADMIN_ID);

  const response = await app.inject({
    method: "POST",
    payload: { action: "ban_user" },
    url: `/admin/reports/${REPORT_ID}/action`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(db.rows.comments.length, 0);
  assert.equal(db.rows.reported_comments.length, 0);
  assert.equal(
    db.rows.profiles.find((profile) => profile.id === OTHER_USER_ID)?.is_banned,
    true,
  );
  assert.equal(db.rpcCalls.at(-1)?.fn, "resolve_comment_report");
  await app.close();
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
