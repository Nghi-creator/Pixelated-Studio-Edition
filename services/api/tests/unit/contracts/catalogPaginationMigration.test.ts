import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDir,
  "../../../../../supabase/migrations/20260729120000_paginate_published_catalog.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

test("catalog page RPC applies offset and a bounded page size before JSON aggregation", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.published_catalog_games_page/);
  assert.match(migration, /OFFSET greatest\(0, coalesce\(p_offset, 0\)\)/);
  assert.match(
    migration,
    /LIMIT greatest\(1, least\(coalesce\(p_page_size, 15\), 50\)\)/,
  );
  assert.ok(
    migration.indexOf("page_games AS") <
      migration.indexOf("jsonb_agg"),
  );
});

test("new catalog RPCs remain service-role-only", () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.published_catalog_games_page[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.published_catalog_games_page[\s\S]*TO service_role;/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.published_catalog_filters\(\)[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
});
