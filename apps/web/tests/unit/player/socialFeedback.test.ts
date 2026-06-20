import assert from "node:assert/strict";
import test from "node:test";
import { getSocialErrorMessage } from "../../../src/features/player/socialFeedback.ts";

test("social feedback surfaces API errors and preserves safe fallbacks", () => {
  assert.equal(
    getSocialErrorMessage(
      { payload: { error: "Reaction limit reached. Please try again shortly." } },
      "fallback",
    ),
    "Reaction limit reached. Please try again shortly.",
  );
  assert.equal(getSocialErrorMessage(new Error("private detail"), "fallback"), "fallback");
});
