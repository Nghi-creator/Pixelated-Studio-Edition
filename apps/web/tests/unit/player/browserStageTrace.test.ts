import assert from "node:assert/strict";
import { after, test } from "node:test";
import { writeFileSync } from "node:fs";
import { BrowserStageTraceRecording, attachBrowserStageTrace } from "../../../src/features/player/observability/browserStageTrace.ts";
import { parseBrowserStageTraceConfig } from "../../../src/features/player/observability/browserStageTraceConfig.ts";

const snapshots: unknown[] = [];
const config = { every_nth_frame: 1, max_frames: 2000, max_events: 10000 };
function snapshot(recording: BrowserStageTraceRecording) {
  recording.finish();
  const value = recording.snapshot("a".repeat(40), "synthetic");
  snapshots.push(value);
  for (const stream of value.streams) {
    const loss = stream.loss;
    assert.equal(loss.offered_frames, loss.sampled_frames + loss.unsampled_frames + loss.frame_capacity_dropped);
    assert.equal(loss.sampled_frames, stream.frames.length);
    assert.equal(loss.retained_events, stream.events.length);
    assert.equal(loss.attempted_events, loss.retained_events + loss.event_capacity_dropped + loss.event_invalid_timestamp_dropped + loss.event_contention_dropped + loss.event_shutdown_dropped + loss.event_correlation_dropped);
  }
  return value;
}
function fakeVideo() {
  let next = 0;
  const pending = new Map<number, (now: number, metadata: { presentationTime: number; presentedFrames: number }) => void>();
  const video = {
    requestVideoFrameCallback(callback: (now: number, metadata: { presentationTime: number; presentedFrames: number }) => void) { pending.set(++next, callback); return next; },
    cancelVideoFrameCallback(handle: number) { pending.delete(handle); },
  };
  return { video, pending, fire(now: number, presentationTime: number, presentedFrames: number) {
    assert.equal(pending.size, 1);
    const [handle, callback] = [...pending][0]!;
    pending.delete(handle); callback(now, { presentationTime, presentedFrames });
  } };
}

test("disabled ignores knobs and enabled configuration is bounded/copied", () => {
  assert.equal(parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE_MAX_FRAMES: "bad" }), null);
  assert.deepEqual(parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: "1" }), config);
  const input = { ...config };
  const recording = new BrowserStageTraceRecording(input);
  input.max_frames = 1;
  assert.equal(recording.config.max_frames, 2000);
  assert.ok(Object.isFrozen(recording.config));
});
for (const value of ["true", true, 1, "", null]) test(`invalid enabled value ${JSON.stringify(value)}`, () => {
  assert.throws(() => parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: value }));
});
for (const value of ["0", "2001", "1.5", "-1", "1e3", " 1", true, 2, "99999999999999999", "1\n", "1\r\n", "1\u2028", "1\u2029"]) test(`invalid frame limit ${JSON.stringify(value)}`, () => {
  assert.throws(() => parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: "1", VITE_N4_STAGE_TRACE_MAX_FRAMES: value }));
});

test("only approved endpoints and relative integer ns; detached snapshot", () => {
  const recording = new BrowserStageTraceRecording(config);
  const scope = recording.begin(100, true)!;
  assert.equal(scope.observe(110, 108, 40), true);
  const value = snapshot(recording);
  assert.deepEqual(value.streams[0]!.events, [
    { sequence: 1, frame_id: "frame-1", boundary: "presentation_proxy", timestamp_ns: 8000000 },
    { sequence: 2, frame_id: "frame-1", boundary: "presentation_callback", timestamp_ns: 10000000 },
  ]);
  assert.equal(value.streams[0]!.clock.resolution_ns, null);
  assert.deepEqual(value.streams[0]!.capabilities.filter(cap => cap.state === "supported").map(cap => cap.boundary), ["presentation_proxy"]);
  value.streams[0]!.events[0]!.timestamp_ns = 0;
  assert.equal(recording.snapshot("a".repeat(40), "synthetic").streams[0]!.events[0]!.timestamp_ns, 8000000);
  assert.equal(scope.observe(120, 118, 41), false);
});

test("sampling uses callback sequence and misses include unsampled callbacks", () => {
  const recording = new BrowserStageTraceRecording({ ...config, every_nth_frame: 2 });
  const scope = recording.begin(0, true)!;
  for (const [now, presented] of [[10, 10], [20, 13], [30, 17], [40, 18]]) scope.observe(now!, now! - 1, presented!);
  const stream = snapshot(recording).streams[0]!;
  assert.deepEqual(stream.frames.map(frame => frame.source_sequence), [1, 3]);
  assert.equal(stream.loss.browser_missed_presentations, 5);
  assert.equal(stream.loss.unsampled_frames, 2);
});

test("frame prefix capacity is shared across lifetimes and never refilled", () => {
  const recording = new BrowserStageTraceRecording({ ...config, max_frames: 2 });
  const first = recording.begin(0, true)!;
  first.observe(2, 1, 1); first.stop();
  const second = recording.begin(10, true)!;
  second.observe(12, 11, 20);
  assert.equal(second.observe(14, 13, 21), false);
  const third = recording.begin(20, true)!;
  assert.equal(third.observe(22, 21, 30), false);
  const streams = snapshot(recording).streams;
  assert.deepEqual(streams.map(stream => stream.frames.length), [1, 1, 0]);
  assert.equal(streams[1]!.loss.frame_capacity_dropped, 1);
  assert.equal(streams[2]!.stop_reason, "capacity");
  assert.deepEqual(streams.map(stream => stream.clock_id), ["clock-1", "clock-2", "clock-3"]);
});

test("odd event limit retains a partial pair with exact loss, globally", () => {
  const recording = new BrowserStageTraceRecording({ ...config, max_events: 1 });
  const first = recording.begin(0, true)!;
  assert.equal(first.observe(2, 1, 1), false);
  recording.begin(10, true)!.observe(12, 11, 2);
  const streams = snapshot(recording).streams;
  assert.equal(streams[0]!.loss.event_capacity_dropped, 1);
  assert.equal(streams[1]!.loss.event_capacity_dropped, 2);
  assert.equal(streams.flatMap(stream => stream.events).length, 1);
});

for (const presentation of [NaN, Infinity, -1, Number.MAX_VALUE]) test(`invalid presentation ${presentation} keeps loss and sequence gap`, () => {
  const recording = new BrowserStageTraceRecording(config);
  recording.begin(0, true)!.observe(2, presentation, 1);
  const stream = snapshot(recording).streams[0]!;
  assert.equal(stream.loss.event_invalid_timestamp_dropped, 1);
  assert.equal(stream.events[0]!.sequence, 2);
});

test("zero and negative deltas remain evidence; ns rounding uses positive ties up", () => {
  const recording = new BrowserStageTraceRecording(config);
  const scope = recording.begin(0, true)!;
  scope.observe(0.0000005, 0, 1);
  scope.observe(2, 2, 2);
  scope.observe(3, 4, 3);
  assert.deepEqual(snapshot(recording).streams[0]!.events.map(event => event.timestamp_ns), [0, 1, 2000000, 2000000, 4000000, 3000000]);
});

for (const [now, presented] of [[9, 2], [12, 1], [12, 0], [NaN, 2], [12, 1.5], [12, 0x100000000]]) test(`invalid/reset callback ${now}/${presented} closes scope`, () => {
  const recording = new BrowserStageTraceRecording(config);
  const scope = recording.begin(0, true)!;
  scope.observe(10, 9, 1);
  assert.equal(scope.observe(now!, 11, presented!), false);
  const stream = snapshot(recording).streams[0]!;
  assert.equal(stream.stop_reason, "source_error");
  assert.equal(stream.loss.offered_frames, 1);
});

test("API absence and missing cancellation yield unavailable empty evidence", () => {
  for (const video of [{}, { requestVideoFrameCallback: () => { throw new Error("must not call"); } }]) {
    const recording = new BrowserStageTraceRecording(config);
    attachBrowserStageTrace(video, recording, () => 0)();
    const stream = snapshot(recording).streams[0]!;
    assert.equal(stream.capabilities.at(-1)!.reason, "api_unavailable");
    assert.equal(stream.frames.length, 0);
  }
});

test("one outstanding callback, idempotent detach, late delivery after failed cancellation", () => {
  const fake = fakeVideo();
  const recording = new BrowserStageTraceRecording(config);
  const stop = attachBrowserStageTrace(fake.video, recording, () => 0);
  fake.fire(10, 9, 1);
  const late = [...fake.pending.values()][0]!;
  fake.video.cancelVideoFrameCallback = () => { throw new Error("cancel failed"); };
  stop(); stop(); late(20, { presentationTime: 19, presentedFrames: 2 });
  assert.equal(snapshot(recording).streams[0]!.loss.offered_frames, 1);
});

test("finish cancels active bindings; reattach uses separate epochs", () => {
  const fake = fakeVideo();
  const recording = new BrowserStageTraceRecording(config);
  attachBrowserStageTrace(fake.video, recording, () => 0)();
  attachBrowserStageTrace(fake.video, recording, () => 10);
  fake.fire(12, 11, 1);
  const streams = snapshot(recording).streams;
  assert.equal(fake.pending.size, 0);
  assert.equal(streams[1]!.stop_reason, "shutdown");
  assert.equal(recording.begin(0, true), null);
});

test("registration failure and malformed metadata cannot escape into playback", () => {
  const recording = new BrowserStageTraceRecording(config);
  assert.doesNotThrow(() => attachBrowserStageTrace({ requestVideoFrameCallback: () => { throw new Error("API failure"); }, cancelVideoFrameCallback: () => {} }, recording, () => 0));
  const fake = fakeVideo();
  attachBrowserStageTrace(fake.video, recording, () => 0);
  const [callback] = fake.pending.values();
  assert.doesNotThrow(() => callback!(1, null as never));
  const streams = snapshot(recording).streams;
  assert.equal(streams[0]!.capabilities.at(-1)!.reason, "api_unavailable");
  assert.equal(streams[1]!.stop_reason, "source_error");
});

test("metadata allowlist does not read optional/private fields", () => {
  const fake = fakeVideo();
  const recording = new BrowserStageTraceRecording(config);
  attachBrowserStageTrace(fake.video, recording, () => 0);
  const [callback] = fake.pending.values();
  const metadata = { presentationTime: 1, presentedFrames: 1 };
  for (const field of ["receiveTime", "captureTime", "rtpTimestamp", "mediaTime", "processingDuration", "expectedDisplayTime", "privateId"]) {
    Object.defineProperty(metadata, field, { get() { throw new Error("private field read"); } });
  }
  callback!(2, metadata);
  const value = snapshot(recording);
  assert.equal(value.streams[0]!.events.length, 2);
  assert.equal(JSON.stringify(value).includes("privateId"), false);
});

test("later registration failure preserves capability active during collected interval", () => {
  const fake = fakeVideo();
  const recording = new BrowserStageTraceRecording(config);
  attachBrowserStageTrace(fake.video, recording, () => 0);
  fake.video.requestVideoFrameCallback = () => { throw new Error("later API failure"); };
  fake.fire(2, 1, 1);
  const stream = snapshot(recording).streams[0]!;
  assert.equal(stream.capabilities.at(-1)!.state, "supported");
  assert.equal(stream.stop_reason, "source_error");
});

test("lifetime limit bounds reconnects; version/finish guard reject unsafe snapshots", () => {
  const recording = new BrowserStageTraceRecording(config);
  assert.throws(() => recording.snapshot("a".repeat(40), "synthetic"));
  for (let index = 0; index < 16; index++) recording.begin(index, false);
  assert.equal(recording.begin(16, true), null);
  assert.equal(snapshot(recording).streams.length, 16);
  assert.throws(() => recording.snapshot("private-version", "synthetic"));
});

test("nonfinite clock and throwing clock install no callbacks", () => {
  const recording = new BrowserStageTraceRecording(config);
  const fake = fakeVideo();
  attachBrowserStageTrace(fake.video, recording, () => NaN);
  attachBrowserStageTrace(fake.video, recording, () => { throw new Error("clock"); });
  assert.equal(fake.pending.size, 0);
  assert.throws(() => snapshot(recording));
});

after(() => {
  if (process.env.N4_BROWSER_SNAPSHOT_OUTPUT) writeFileSync(process.env.N4_BROWSER_SNAPSHOT_OUTPUT, JSON.stringify(snapshots));
});

for (const suffix of ["\n", "\r\n", "\u2028", "\u2029"]) test(`snapshot rejects commit trailing whitespace ${JSON.stringify(suffix)}`, () => {
  const recording = new BrowserStageTraceRecording(config);
  recording.begin(0, true)!.observe(14, 10, 1);
  recording.finish();
  assert.throws(() => recording.snapshot("a".repeat(40) + suffix, "synthetic"));
});
