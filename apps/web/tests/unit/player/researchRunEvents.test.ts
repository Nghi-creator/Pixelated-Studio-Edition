import assert from "node:assert/strict";
import test from "node:test";
import {
  createResearchRunEvent,
  createResearchRunEventsFilename,
  findFirstEventElapsedMs,
  researchRunEventsToCsv,
} from "../../../src/features/player/research/researchRunEvents.ts";

test("research run events capture elapsed time and optional details", () => {
  assert.deepEqual(
    createResearchRunEvent({
      details: { gameId: "beat-beast" },
      name: "play_clicked",
      nowMs: Date.parse("2026-07-04T02:03:05.000Z"),
      runId: "edge-run-1",
      runStartedAt: Date.parse("2026-07-04T02:03:04.000Z"),
      sessionId: "session-1",
    }),
    {
      capturedAt: "2026-07-04T02:03:05.000Z",
      details: { gameId: "beat-beast" },
      elapsedMs: 1000,
      name: "play_clicked",
      runId: "edge-run-1",
      sessionId: "session-1",
    },
  );
});

test("research run events csv quotes details JSON", () => {
  const event = createResearchRunEvent({
    details: { message: "line one\nline two", source: "engine-error" },
    name: "engine_error",
    nowMs: Date.parse("2026-07-04T02:03:05.000Z"),
    runId: "edge-run-1",
    runStartedAt: Date.parse("2026-07-04T02:03:04.000Z"),
    sessionId: "session-1",
  });

  assert.equal(
    researchRunEventsToCsv([event]),
    [
      "captured_at,elapsed_ms,run_id,session_id,event,details_json",
      '2026-07-04T02:03:05.000Z,1000,edge-run-1,session-1,engine_error,"{""message"":""line one\\nline two"",""source"":""engine-error""}"',
    ].join("\n"),
  );
});

test("research run event filenames are filesystem-safe", () => {
  assert.equal(
    createResearchRunEventsFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T02:03:04.000Z"),
      runId: "edge:run:1",
    }),
    "pixelated-research-events-Beat-Beast-edge-study-edge-run-1-2026-07-04T02-03-04-000Z.csv",
  );
});

test("research run event lookup returns the first matching elapsed time", () => {
  const events = [
    createResearchRunEvent({
      name: "python_ready",
      nowMs: 1100,
      runId: "edge-run-1",
      runStartedAt: 1000,
      sessionId: "session-1",
    }),
    createResearchRunEvent({
      name: "first_non_black_frame",
      nowMs: 1300,
      runId: "edge-run-1",
      runStartedAt: 1000,
      sessionId: "session-1",
    }),
    createResearchRunEvent({
      name: "first_non_black_frame",
      nowMs: 1500,
      runId: "edge-run-1",
      runStartedAt: 1000,
      sessionId: "session-1",
    }),
  ];

  assert.equal(findFirstEventElapsedMs(events, "first_non_black_frame"), 300);
  assert.equal(findFirstEventElapsedMs(events, "offer_sent"), null);
});
