import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260828130000_harden_profile_and_account_storage.sql",
  import.meta.url,
);

const migration = fs.readFileSync(migrationUrl, "utf8");

test("profiles remain private and API-owned", () => {
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Public profiles are viewable by everyone\."[\s\S]*ON public\.profiles;/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Users can insert their own profile\."[\s\S]*ON public\.profiles;/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Permanent users can insert profiles"[\s\S]*ON public\.profiles;/,
  );
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.profiles[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /ALTER PUBLICATION supabase_realtime DROP TABLE public\.profiles/,
  );
});

test("direct account asset uploads are serialized and quota bounded", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.account_asset_upload_within_quota\(/,
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /WHEN 'avatars'[\s\S]*max_objects := 10;/);
  assert.match(migration, /max_bytes := 52428800;/);
  assert.match(migration, /WHEN 'submissions'[\s\S]*max_objects := 60;/);
  assert.match(migration, /max_bytes := 1073741824;/);
  assert.match(
    migration,
    /CREATE POLICY "Users can upload their own avatars\."[\s\S]*account_asset_upload_within_quota/,
  );
  assert.match(
    migration,
    /CREATE POLICY "Authenticated users can upload own submissions"[\s\S]*\(storage\.foldername\(name\)\)\[2\] IN \('roms', 'covers', 'banners'\)[\s\S]*account_asset_upload_within_quota/,
  );
});

test("the legacy default library is made private without deleting objects", () => {
  assert.match(
    migration,
    /UPDATE storage\.buckets[\s\S]*SET public = false[\s\S]*WHERE id = 'default_library';/,
  );
  assert.match(
    migration,
    /DROP POLICY IF EXISTS "Allow public read access"[\s\S]*ON storage\.objects;/,
  );
  assert.doesNotMatch(migration, /DELETE FROM storage\.(?:buckets|objects)/);
});
