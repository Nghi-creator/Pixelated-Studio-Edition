import assert from "node:assert/strict";
import test from "node:test";
import { shouldSchedulePlayCount } from "../../../src/features/player/hooks/data/playCountState.ts";

test("play counting starts only after successful playback", () => {
  assert.equal(shouldSchedulePlayCount(undefined, true), false);
  assert.equal(shouldSchedulePlayCount("game-1", false), false);
  assert.equal(shouldSchedulePlayCount("game-1", true), true);
});
