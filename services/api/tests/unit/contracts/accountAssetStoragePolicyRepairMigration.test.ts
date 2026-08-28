import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260828170000_repair_account_asset_storage_policies.sql",
  import.meta.url,
);

const migration = fs.readFileSync(migrationUrl, "utf8");

test("account asset quota accepts Supabase pre-upload metadata", () => {
  assert.match(
    migration,
    /COALESCE\([\s\S]*p_metadata->>'size',[\s\S]*p_metadata->>'contentLength'[\s\S]*\)/,
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /object_bytes <= max_bytes/);
});

test("submission uploads can return only the authenticated owner's row", () => {
  assert.match(
    migration,
    /CREATE POLICY "Authenticated users can read own submissions"[\s\S]*FOR SELECT TO authenticated/,
  );
  assert.match(migration, /bucket_id = 'submissions'/);
  assert.match(migration, /auth\.uid\(\) = owner/);
  assert.match(
    migration,
    /\(storage\.foldername\(name\)\)\[2\] IN \('roms', 'covers', 'banners'\)/,
  );
  assert.doesNotMatch(migration, /USING \(true\)/);
});
