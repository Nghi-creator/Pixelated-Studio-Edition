import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260718133000_atomic_activity_and_smoke_writes.sql",
  import.meta.url,
);

test("activity and browser-smoke writes use private atomic database contracts", () => {
  const migration = fs.readFileSync(migrationUrl, "utf8");

  assert.match(migration, /FUNCTION public\.record_access_log/);
  assert.match(migration, /ON CONFLICT \(session_id\) DO UPDATE/);
  assert.match(migration, /TABLE public\.browser_smoke_artifact_claims/);
  assert.match(migration, /FUNCTION public\.claim_browser_smoke_artifact/);
  assert.match(migration, /ON CONFLICT \(nonce\) DO NOTHING/);
  assert.match(migration, /FUNCTION public\.record_browser_smoke_result/);
  assert.match(migration, /GET DIAGNOSTICS updated_count = ROW_COUNT/);
  assert.equal((migration.match(/FROM PUBLIC, anon, authenticated;/g) || []).length, 4);
});
