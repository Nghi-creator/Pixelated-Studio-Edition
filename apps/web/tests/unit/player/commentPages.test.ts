import assert from "node:assert/strict";
import test from "node:test";
import { mergeCommentPage } from "../../../src/features/player/comments/utils/commentPages.ts";

test("initial comment pages replace stale results", () => {
  assert.deepEqual(mergeCommentPage([{ id: "old" }], [{ id: "fresh" }], true), [
    { id: "fresh" },
  ]);
});

test("later comment pages append in API order", () => {
  assert.deepEqual(
    mergeCommentPage([{ id: "first" }], [{ id: "second" }], false),
    [{ id: "first" }, { id: "second" }],
  );
});

test("later comment pages ignore duplicate rows from overlapping page boundaries", () => {
  assert.deepEqual(
    mergeCommentPage(
      [{ id: "first" }, { id: "boundary" }],
      [{ id: "boundary" }, { id: "second" }],
      false,
    ),
    [{ id: "first" }, { id: "boundary" }, { id: "second" }],
  );
});
