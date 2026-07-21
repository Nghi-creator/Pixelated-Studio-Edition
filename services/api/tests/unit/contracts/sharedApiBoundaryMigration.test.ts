import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260718130000_harden_shared_api_boundaries.sql",
  import.meta.url,
);

test("shared API hardening keeps privileged RPCs private and submissions bounded", () => {
  const migration = fs.readFileSync(migrationUrl, "utf8");

  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.admin_access_log_summary\(integer, integer\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.published_catalog_games\([\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.published_catalog_games\([\s\S]*TO service_role;/,
  );
  assert.match(migration, /public = false/);
  assert.match(migration, /file_size_limit = 67108864/);
});
