import assert from "node:assert/strict";
import test from "node:test";
import {
  createStreamTelemetryGraphFilename,
  createStreamTelemetryCsvFilename,
  latestStreamTelemetryGraphSamples,
  streamTelemetrySamplesToCsv,
  STREAM_TELEMETRY_GRAPH_WINDOW_MS,
  type StreamTelemetryCsvSample,
} from "../../../src/features/player/telemetry/streamTelemetryExport.ts";
import { renderStreamTelemetryGraphPng } from "../../../src/features/player/telemetry/streamTelemetryGraphPng.ts";

const unsupportedBrowserMetrics = {
  availableIncomingBitrateKbps: null,
  decodeTimeMeanMs: null,
  framesDecoded: null,
  framesDropped: null,
  freezeCount: null,
  freezeDurationTotalMs: null,
  jitterBufferDelayMeanMs: null,
  keyFramesDecoded: null,
  roundTripTimeMs: null,
} as const;

test("stream telemetry csv export includes stable research columns", () => {
  const sample: StreamTelemetryCsvSample = {
    ...unsupportedBrowserMetrics,
    availableIncomingBitrateKbps: 2400,
    bitrateKbps: 991.2,
    capturedAt: "2026-07-04T00:46:56.000Z",
    connectionState: "connected",
    elapsedMs: 1000,
    decodeTimeMeanMs: 2.5,
    fps: 60,
    framesDecoded: 600,
    framesDropped: 2,
    freezeCount: 1,
    freezeDurationTotalMs: 120,
    gameId: "beat-beast",
    iceConnectionState: "connected",
    jitterMs: 4,
    jitterBufferDelayMeanMs: 3,
    keyFramesDecoded: 4,
    lastEngineError: null,
    packetsLostDelta: 0,
    packetsLostTotal: 1,
    playerMode: "host",
    roundTripTimeMs: 12,
    sessionId: "session-1",
    status: "running",
  };

  assert.equal(
    streamTelemetrySamplesToCsv([sample]),
    [
      "captured_at,elapsed_ms,session_id,game_id,player_mode,status,fps,bitrate_kbps,packets_lost_total,packets_lost_delta,jitter_ms,ice_connection_state,connection_state,last_engine_error,round_trip_time_ms,frames_decoded,frames_dropped,decode_time_mean_ms,jitter_buffer_delay_mean_ms,freeze_count,freeze_duration_total_ms,key_frames_decoded,available_incoming_bitrate_kbps",
      "2026-07-04T00:46:56.000Z,1000,session-1,beat-beast,host,running,60,991.2,1,1,4,connected,connected,,12,600,2,2.5,3,1,120,4,2400",
    ].join("\n"),
  );
});

test("stream telemetry csv export quotes comma and newline values", () => {
  const sample: StreamTelemetryCsvSample = {
    ...unsupportedBrowserMetrics,
    bitrateKbps: null,
    capturedAt: "2026-07-04T00:46:56.000Z",
    connectionState: "failed",
    elapsedMs: 0,
    fps: null,
    gameId: "game,with,comma",
    iceConnectionState: "disconnected",
    jitterMs: null,
    lastEngineError: "line one\nline two",
    packetsLostDelta: 0,
    packetsLostTotal: 0,
    playerMode: "guest",
    sessionId: "session-1",
    status: "reconnecting",
  };

  assert.match(
    streamTelemetrySamplesToCsv([sample]),
    /"game,with,comma",guest,reconnecting,,,0,0,,disconnected,failed,"line one\nline two"/,
  );
});

test("stream telemetry csv neutralizes spreadsheet formulas", () => {
  const sample: StreamTelemetryCsvSample = {
    ...unsupportedBrowserMetrics,
    bitrateKbps: null,
    capturedAt: "2026-07-04T00:46:56.000Z",
    connectionState: "failed",
    elapsedMs: 0,
    fps: null,
    gameId: "=HYPERLINK(\"https://example.test\")",
    iceConnectionState: "disconnected",
    jitterMs: null,
    lastEngineError: "+cmd",
    packetsLostDelta: 0,
    packetsLostTotal: 0,
    playerMode: "guest",
    sessionId: "session-1",
    status: "running",
  };

  const csv = streamTelemetrySamplesToCsv([sample]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /,failed,'\+cmd,/);
});

test("stream telemetry csv export adds packet loss deltas", () => {
  const baseSample: StreamTelemetryCsvSample = {
    ...unsupportedBrowserMetrics,
    bitrateKbps: 900,
    capturedAt: "2026-07-04T00:46:56.000Z",
    connectionState: "connected",
    elapsedMs: 0,
    fps: 60,
    gameId: "beat-beast",
    iceConnectionState: "connected",
    jitterMs: 4,
    lastEngineError: null,
    packetsLostDelta: 0,
    packetsLostTotal: 1,
    playerMode: "host",
    sessionId: "session-1",
    status: "playing",
  };

  assert.equal(
    streamTelemetrySamplesToCsv([
      baseSample,
      { ...baseSample, capturedAt: "2026-07-04T00:46:57.000Z", packetsLostTotal: 1 },
      { ...baseSample, capturedAt: "2026-07-04T00:46:58.000Z", packetsLostTotal: 4 },
    ]),
    [
      "captured_at,elapsed_ms,session_id,game_id,player_mode,status,fps,bitrate_kbps,packets_lost_total,packets_lost_delta,jitter_ms,ice_connection_state,connection_state,last_engine_error,round_trip_time_ms,frames_decoded,frames_dropped,decode_time_mean_ms,jitter_buffer_delay_mean_ms,freeze_count,freeze_duration_total_ms,key_frames_decoded,available_incoming_bitrate_kbps",
      "2026-07-04T00:46:56.000Z,0,session-1,beat-beast,host,playing,60,900,1,1,4,connected,connected,,,,,,,,,,",
      "2026-07-04T00:46:57.000Z,0,session-1,beat-beast,host,playing,60,900,1,0,4,connected,connected,,,,,,,,,,",
      "2026-07-04T00:46:58.000Z,0,session-1,beat-beast,host,playing,60,900,4,3,4,connected,connected,,,,,,,,,,",
    ].join("\n"),
  );
});

test("stream telemetry csv filenames are filesystem-safe", () => {
  assert.equal(
    createStreamTelemetryCsvFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T00:46:56.000Z"),
      sessionId: "session:1",
    }),
    "pixelated-stream-telemetry-Beat-Beast-edge-study-session-1-2026-07-04T00-46-56-000Z.csv",
  );
});

test("stream telemetry graph filenames are filesystem-safe png names", () => {
  assert.equal(
    createStreamTelemetryGraphFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T00:46:56.000Z"),
      sessionId: "session:1",
    }),
    "pixelated-stream-telemetry-graph-Beat-Beast-edge-study-session-1-2026-07-04T00-46-56-000Z.png",
  );
});

test("stream telemetry graph export keeps the latest one minute", () => {
  const samples = [0, 30_000, 59_999, 60_000, 60_001, 90_000, 121_000].map(
    (elapsedMs) => ({
      bitrateKbps: 900,
      elapsedMs,
      fps: 60,
      jitterMs: 4,
      packetsLostDelta: 0,
      packetsLostTotal: 1,
    }),
  );

  assert.deepEqual(
    latestStreamTelemetryGraphSamples(
      samples,
      STREAM_TELEMETRY_GRAPH_WINDOW_MS,
    ).map((sample) => sample.elapsedMs),
    [90_000, 121_000],
  );
});

test("stream telemetry graph rendering returns null without samples", () => {
  assert.equal(
    renderStreamTelemetryGraphPng([], {
      gameTitle: "BeatBeast",
      playerMode: "host",
      sampleCount: 0,
      status: "playing",
    }),
    null,
  );
});
