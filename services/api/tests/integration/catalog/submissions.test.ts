import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  OTHER_USER_ID,
  type RecordRow,
  seedProfiles,
  SUPER_ADMIN_ID,
  USER_ID,
  validSubmissionPayload,
} from "../support/dataBoundarySupport.js";

const STORAGE_BASE =
  process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";
test("submissions persist metadata for the authenticated submitter", async () => {
  const db = new FakeSupabase();
  let notifiedSubmission: RecordRow | null = null;
  const app = await createDataBoundaryApp(db, USER_ID, Buffer.from("test-artifact"), {
    notifySubmission: async (submission: RecordRow) => {
      notifiedSubmission = submission;
    },
  });
  const romUrl = `${STORAGE_BASE}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.gba`;

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      bannerUrl: `${STORAGE_BASE}/storage/v1/object/public/submissions/${USER_ID}/banners/banner.png`,
      coverUrl: `${STORAGE_BASE}/storage/v1/object/public/submissions/${USER_ID}/covers/cover.png`,
      romUrl,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 201);
  assert.equal(db.rows.game_submissions.length, 1);
  assert.equal(db.rows.game_submissions[0]?.submitter_id, USER_ID);
  assert.equal(db.rows.game_submissions[0]?.game_title, "Tiny Quest");
  assert.equal(db.rows.game_submissions[0]?.attribution_text, "Tiny Quest by Pixel Dev");
  assert.equal(db.rows.game_submissions[0]?.ownership_status, "creator");
  assert.equal(db.rows.game_submissions[0]?.hosting_confirmed, true);
  assert.equal(db.rows.game_submissions[0]?.rom_url, romUrl);
  assert.match(String(notifiedSubmission?.romUrl), /\/object\/sign\/submissions\//);
  assert.match(String(notifiedSubmission?.coverUrl), /\/object\/sign\/submissions\//);
  assert.match(String(notifiedSubmission?.bannerUrl), /\/object\/sign\/submissions\//);
  assert.deepEqual(
    db.signedStorageUrls.map(({ bucket, path }) => ({ bucket, path })),
    [
      { bucket: "submissions", path: `${USER_ID}/roms/tiny.gba` },
      { bucket: "submissions", path: `${USER_ID}/covers/cover.png` },
      { bucket: "submissions", path: `${USER_ID}/banners/banner.png` },
    ],
  );
  await app.close();
});

test("submissions reject unsupported ROM extensions", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.zip`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 400);
  assert.match(
    response.json<{ error: string }>().error,
    /supported game file/,
  );
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("super admins cannot submit games for review", async () => {
  const db = new FakeSupabase();
  seedProfiles(db);
  const app = await createDataBoundaryApp(db, SUPER_ADMIN_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      authorName: "Root",
      email: "root@example.com",
      gameTitle: "Root Quest",
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${SUPER_ADMIN_ID}/roms/root.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("submissions reject files outside the authenticated user's folder", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${OTHER_USER_ID}/roms/tiny.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 400);
  assert.equal(db.rows.game_submissions.length, 0);
  await app.close();
});

test("submissions are rate limited per authenticated user", async () => {
  const db = new FakeSupabase();
  const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  db.rows.game_submissions.push(
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: USER_ID },
    { created_at: recentTime, submitter_id: OTHER_USER_ID },
  );
  const app = await createDataBoundaryApp(db, USER_ID);
  const storageBase =
    process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://example.com";

  const response = await app.inject({
    method: "POST",
    payload: validSubmissionPayload({
      romUrl: `${storageBase}/storage/v1/object/public/submissions/${USER_ID}/roms/tiny.nes`,
    }),
    url: "/submissions/games",
  });

  assert.equal(response.statusCode, 429);
  assert.equal(db.rows.game_submissions.length, 4);
  await app.close();
});
