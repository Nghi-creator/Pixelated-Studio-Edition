import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260730120000_atomic_submission_rejection.sql",
  import.meta.url,
);

test("submission rejection is a row-locked service-role-only transition", () => {
  const migration = fs.readFileSync(migrationUrl, "utf8");

  assert.match(migration, /FUNCTION public\.reject_game_submission/);
  assert.match(migration, /FROM public\.game_submissions[\s\S]*FOR UPDATE;/);
  assert.match(migration, /v_submission\.status <> 'pending'/);
  assert.match(migration, /MESSAGE = 'submission_already_reviewed'/);
  assert.match(migration, /status = 'rejected'/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.reject_game_submission[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.reject_game_submission[\s\S]*TO service_role/,
  );
});
