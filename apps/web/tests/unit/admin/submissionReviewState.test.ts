import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultSubmissionAttribution,
  getSubmissionArtifactName,
  parseRightsWarnings,
} from "../../../src/features/admin/submissionReviewState.ts";

test("submission review state formats uploaded artifact names", () => {
  assert.equal(
    getSubmissionArtifactName(
      "https://example.test/storage/v1/object/public/submissions/user/roms/Tiny%20Quest.nes",
    ),
    "Tiny Quest.nes",
  );
  assert.equal(getSubmissionArtifactName("not-a-url"), "not-a-url");
});

test("submission review state prepares rights defaults", () => {
  assert.equal(
    getDefaultSubmissionAttribution({
      author_name: "Pixel Dev",
      game_title: "Tiny Quest",
    }),
    "Tiny Quest by Pixel Dev. Submitted to Pixelated for non-commercial cloud library review.",
  );
  assert.deepEqual(parseRightsWarnings("Keep attribution.\n\nConfirm art.\n"), [
    "Keep attribution.",
    "Confirm art.",
  ]);
});
