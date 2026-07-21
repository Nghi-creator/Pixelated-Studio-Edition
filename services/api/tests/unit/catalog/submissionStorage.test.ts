import assert from "node:assert/strict";
import test from "node:test";
import { getSubmissionObjectPath } from "../../../src/modules/catalog/domain/submissionStorage.js";

const SUPABASE_URL = "https://project.supabase.co";

test("submission storage accepts only the configured project and bucket", () => {
  assert.equal(
    getSubmissionObjectPath(
      `${SUPABASE_URL}/storage/v1/object/public/submissions/user/roms/game.nes`,
      SUPABASE_URL,
    ),
    "user/roms/game.nes",
  );
  assert.equal(
    getSubmissionObjectPath(
      "https://attacker.example/storage/v1/object/public/submissions/user/roms/game.nes",
      SUPABASE_URL,
    ),
    null,
  );
  assert.equal(
    getSubmissionObjectPath(
      `${SUPABASE_URL}/storage/v1/object/public/avatars/user/avatar.png`,
      SUPABASE_URL,
    ),
    null,
  );
});

test("submission storage rejects encoded path traversal", () => {
  assert.equal(
    getSubmissionObjectPath(
      `${SUPABASE_URL}/storage/v1/object/public/submissions/user/%2e%2e/private`,
      SUPABASE_URL,
    ),
    null,
  );
});
