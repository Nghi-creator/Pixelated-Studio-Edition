import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebRTCStatsParserState,
  parseWebRTCStats,
} from "../../../src/lib/webrtc/telemetry/webrtcStatsParser.ts";

type StatsFixture = Parameters<typeof parseWebRTCStats>[0] extends Iterable<
  infer Report
>
  ? Report
  : never;

function report(values: Record<string, unknown>) {
  return values as StatsFixture;
}

test("WebRTC stats parser derives interval and selected-pair metrics", () => {
  const first = parseWebRTCStats(
    [
      report({
        bytesReceived: 100_000,
        framesDecoded: 100,
        framesDropped: 2,
        framesPerSecond: 60,
        freezeCount: 1,
        id: "inbound-video",
        jitter: 0.004,
        jitterBufferDelay: 0.5,
        jitterBufferEmittedCount: 100,
        keyFramesDecoded: 3,
        kind: "video",
        packetsLost: 1,
        timestamp: 1_000,
        totalDecodeTime: 0.2,
        totalFreezesDuration: 0.1,
        type: "inbound-rtp",
      }),
      report({
        bytesReceived: 50_000,
        id: "inbound-audio",
        kind: "audio",
        packetsLost: 2,
        timestamp: 1_000,
        type: "inbound-rtp",
      }),
      report({
        id: "transport-1",
        selectedCandidatePairId: "pair-selected",
        timestamp: 1_000,
        type: "transport",
      }),
      report({
        availableIncomingBitrate: 3_000_000,
        currentRoundTripTime: 0.012,
        id: "pair-selected",
        timestamp: 1_000,
        type: "candidate-pair",
      }),
      report({
        currentRoundTripTime: 9,
        id: "pair-other",
        nominated: true,
        state: "succeeded",
        timestamp: 1_000,
        type: "candidate-pair",
      }),
    ],
    createWebRTCStatsParserState(),
  );

  assert.equal(first.metrics.bitrateKbps, null);
  assert.equal(first.metrics.decodeTimeMeanMs, null);
  assert.equal(first.metrics.jitterBufferDelayMeanMs, null);
  assert.equal(first.metrics.roundTripTimeMs, 12);
  assert.equal(first.metrics.availableIncomingBitrateKbps, 3_000);
  assert.equal(first.metrics.framesDecoded, 100);
  assert.equal(first.metrics.framesDropped, 2);
  assert.equal(first.metrics.freezeCount, 1);
  assert.equal(first.metrics.freezeDurationTotalMs, 100);
  assert.equal(first.metrics.keyFramesDecoded, 3);
  assert.equal(first.metrics.packetsLost, 3);
  assert.equal(first.metrics.jitterMs, 4);

  const second = parseWebRTCStats(
    [
      report({
        bytesReceived: 200_000,
        framesDecoded: 160,
        framesDropped: 4,
        framesPerSecond: 58,
        freezeCount: 2,
        id: "inbound-video",
        jitter: 0.006,
        jitterBufferDelay: 0.8,
        jitterBufferEmittedCount: 160,
        keyFramesDecoded: 4,
        kind: "video",
        packetsLost: 2,
        timestamp: 2_000,
        totalDecodeTime: 0.38,
        totalFreezesDuration: 0.15,
        type: "inbound-rtp",
      }),
      report({
        bytesReceived: 75_000,
        id: "inbound-audio",
        kind: "audio",
        packetsLost: 2,
        timestamp: 2_000,
        type: "inbound-rtp",
      }),
    ],
    first.state,
  );

  assert.equal(second.metrics.bitrateKbps, 1_000);
  assert.ok(Math.abs((second.metrics.decodeTimeMeanMs ?? 0) - 3) < 1e-9);
  assert.ok(
    Math.abs((second.metrics.jitterBufferDelayMeanMs ?? 0) - 5) < 1e-9,
  );
  assert.equal(second.metrics.fps, 58);
});

test("WebRTC stats parser returns null for unsupported and reset counters", () => {
  const initial = parseWebRTCStats(
    [
      report({
        bytesReceived: 1_000,
        framesDecoded: 10,
        id: "video-1",
        kind: "video",
        timestamp: 1_000,
        totalDecodeTime: 0.1,
        type: "inbound-rtp",
      }),
    ],
    createWebRTCStatsParserState(),
  );
  const reset = parseWebRTCStats(
    [
      report({
        bytesReceived: 100,
        framesDecoded: 1,
        id: "video-1",
        kind: "video",
        timestamp: 2_000,
        totalDecodeTime: 0.01,
        type: "inbound-rtp",
      }),
    ],
    initial.state,
  );

  assert.equal(reset.metrics.bitrateKbps, null);
  assert.equal(reset.metrics.decodeTimeMeanMs, null);
  assert.equal(reset.metrics.jitterBufferDelayMeanMs, null);
  assert.equal(reset.metrics.roundTripTimeMs, null);
  assert.equal(reset.metrics.framesDropped, null);

  const replacement = parseWebRTCStats(
    [
      report({
        bytesReceived: 5_000,
        framesDecoded: 50,
        id: "video-replacement",
        kind: "video",
        timestamp: 3_000,
        totalDecodeTime: 0.5,
        type: "inbound-rtp",
      }),
    ],
    reset.state,
  );
  assert.equal(replacement.metrics.bitrateKbps, null);
  assert.equal(replacement.metrics.decodeTimeMeanMs, null);
});
