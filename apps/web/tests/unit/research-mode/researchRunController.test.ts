import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultResearchRunConfig } from "../../../src/features/research-mode/researchRunConfig.ts";
import {
  createResearchRunControllerState,
  getResearchRecordingDurationMs,
  getResearchRunRemainingMs,
  researchRunControllerReducer,
} from "../../../src/features/research-mode/researchRunController.ts";

test("research run controller accepts only ordered transitions", () => {
    let state = createResearchRunControllerState(0);
  assert.equal(
    researchRunControllerReducer(state, { nowMs: 1, type: "start_warmup" }),
    state,
  );

    state = researchRunControllerReducer(state, { nowMs: 1, type: "connect" });
    state = researchRunControllerReducer(state, {
      nowMs: 2,
      type: "connection_ready",
    });
    state = researchRunControllerReducer(state, {
      nowMs: 3,
      type: "start_warmup",
    });
    state = researchRunControllerReducer(state, {
      nowMs: 13,
      type: "start_recording",
    });
    state = researchRunControllerReducer(state, {
      completionKind: "automatic",
      nowMs: 73,
      sampleCount: 60,
      type: "finish_recording",
    });

  assert.deepEqual(
    {
      completionKind: state.completionKind,
      endedAtMs: state.endedAtMs,
      recordingStartedAtMs: state.recordingStartedAtMs,
      sampleCount: state.sampleCount,
      stage: state.stage,
    },
    {
      completionKind: "automatic",
      endedAtMs: 73,
      recordingStartedAtMs: 13,
      sampleCount: 60,
      stage: "completed",
    },
  );
  assert.equal(getResearchRecordingDurationMs(state), 60);
});

test("research run controller rejects capture without telemetry", () => {
    let state = createResearchRunControllerState(0);
    state = researchRunControllerReducer(state, { nowMs: 1, type: "connect" });
    state = researchRunControllerReducer(state, {
      nowMs: 2,
      type: "connection_ready",
    });
    state = researchRunControllerReducer(state, {
      nowMs: 3,
      type: "start_warmup",
    });
    state = researchRunControllerReducer(state, {
      nowMs: 4,
      type: "start_recording",
    });
    state = researchRunControllerReducer(state, {
      completionKind: "manual",
      nowMs: 5,
      sampleCount: 0,
      type: "finish_recording",
    });

  assert.equal(state.stage, "invalid");
  assert.match(state.invalidReason || "", /without telemetry samples/);
});

test("research run controller countdown and terminal state", () => {
    const config = {
      ...createDefaultResearchRunConfig("game-1"),
      comparisonCaseId: "comparison-1",
      warmupDurationMs: 10_000,
    };
    let state = createResearchRunControllerState(0);
    state = researchRunControllerReducer(state, { nowMs: 1, type: "connect" });
    state = researchRunControllerReducer(state, {
      nowMs: 2,
      type: "connection_ready",
    });
    state = researchRunControllerReducer(state, {
      nowMs: 100,
      type: "start_warmup",
    });
  assert.equal(getResearchRunRemainingMs(state, config, 4_100), 6_000);

    state = researchRunControllerReducer(state, {
      nowMs: 5_000,
      reason: "connection lost",
      sampleCount: 4,
      type: "invalidate",
    });
  assert.equal(state.stage, "invalid");
  assert.equal(state.sampleCount, 4);
  assert.equal(
    researchRunControllerReducer(state, {
      nowMs: 6_000,
      sampleCount: 5,
      type: "cancel",
    }),
    state,
  );
});
