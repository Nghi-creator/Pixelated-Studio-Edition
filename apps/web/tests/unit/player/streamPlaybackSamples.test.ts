import assert from "node:assert/strict";
import test from "node:test";
import {
  BLACK_FRAME_FAILURE_SAMPLE_COUNT,
  createStreamPlaybackSampleTracker,
  FALLBACK_BAD_SAMPLE_COUNT,
  FALLBACK_HEALTHY_SAMPLE_COUNT,
} from "../../../src/features/player/hooks/streamPlaybackSamples.ts";

test("black frame samples activate fallback before reporting a stall", () => {
  const tracker = createStreamPlaybackSampleTracker();
  let result = { fallbackActive: false, shouldReportStall: false };

  for (let index = 0; index < FALLBACK_BAD_SAMPLE_COUNT; index += 1) {
    result = tracker.recordSample(true);
  }

  assert.equal(result.fallbackActive, true);
  assert.equal(result.shouldReportStall, false);
});

test("sustained black frame samples report a retryable stall once", () => {
  const tracker = createStreamPlaybackSampleTracker();
  let reports = 0;

  for (let index = 0; index < BLACK_FRAME_FAILURE_SAMPLE_COUNT + 2; index += 1) {
    const result = tracker.recordSample(true);
    if (result.shouldReportStall) reports += 1;
  }

  assert.equal(reports, 1);
});

test("healthy samples clear fallback and allow a later stall report", () => {
  const tracker = createStreamPlaybackSampleTracker();
  let reports = 0;

  for (let index = 0; index < BLACK_FRAME_FAILURE_SAMPLE_COUNT; index += 1) {
    if (tracker.recordSample(true).shouldReportStall) reports += 1;
  }

  let result = { fallbackActive: true, shouldReportStall: false };
  for (let index = 0; index < FALLBACK_HEALTHY_SAMPLE_COUNT; index += 1) {
    result = tracker.recordSample(false);
  }
  assert.equal(result.fallbackActive, false);

  for (let index = 0; index < BLACK_FRAME_FAILURE_SAMPLE_COUNT; index += 1) {
    if (tracker.recordSample(true).shouldReportStall) reports += 1;
  }

  assert.equal(reports, 2);
});
