import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260716163000_atomic_admin_workflows.sql",
  import.meta.url,
);

test("admin multi-write workflows are transaction-scoped service RPCs", () => {
  const migration = fs.readFileSync(migrationUrl, "utf8");

  assert.match(migration, /FUNCTION public\.create_submission_candidate/);
  assert.match(migration, /FUNCTION public\.resolve_comment_report/);
  assert.equal((migration.match(/FOR UPDATE;/g) || []).length, 3);
  assert.equal((migration.match(/SECURITY DEFINER/g) || []).length, 2);
  assert.equal((migration.match(/SET search_path = ''/g) || []).length, 2);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_submission_candidate[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.resolve_comment_report[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
});
