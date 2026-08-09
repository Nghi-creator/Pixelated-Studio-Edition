import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260809153000_harden_avatar_uploads.sql",
  import.meta.url,
);

test("avatar storage enforces the profile upload and ownership contract", () => {
  const migration = fs.readFileSync(migrationUrl, "utf8");

  assert.match(migration, /file_size_limit = 5242880/);
  assert.match(
    migration,
    /allowed_mime_types = ARRAY\['image\/jpeg'\]::text\[\]/,
  );
  assert.match(
    migration,
    /CREATE POLICY "Users can upload their own avatars\."[\s\S]*\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
  );
  assert.match(
    migration,
    /CREATE POLICY "Users can update their own avatars\."[\s\S]*WITH CHECK[\s\S]*\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
  );
  assert.match(
    migration,
    /CREATE POLICY "Users can delete their own avatars\."[\s\S]*\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
  );
});
