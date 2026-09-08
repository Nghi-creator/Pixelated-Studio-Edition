import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260828170000_repair_account_asset_storage_policies.sql",
  import.meta.url,
);

const migration = fs.readFileSync(migrationUrl, "utf8");
const writePolicyRepairMigration = fs.readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260908090000_repair_submission_storage_write_policies.sql",
    import.meta.url,
  ),
  "utf8",
);

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

test("submission write-policy repair restores scoped uploads and cleanup", () => {
  assert.match(
    writePolicyRepairMigration,
    /CREATE POLICY "Authenticated users can upload own submissions"[\s\S]*FOR INSERT TO authenticated/,
  );
  assert.match(writePolicyRepairMigration, /auth\.uid\(\) = owner/);
  assert.match(
    writePolicyRepairMigration,
    /\(storage\.foldername\(name\)\)\[2\] IN \('roms', 'covers', 'banners'\)/,
  );
  assert.match(writePolicyRepairMigration, /account_asset_upload_within_quota/);
  assert.match(
    writePolicyRepairMigration,
    /CREATE POLICY "Authenticated users can delete own submissions"[\s\S]*FOR DELETE TO authenticated/,
  );
  assert.doesNotMatch(writePolicyRepairMigration, /USING \(true\)/);
});
