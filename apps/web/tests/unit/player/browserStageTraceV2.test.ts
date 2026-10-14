import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BrowserStageTraceRecording, attachBrowserStageTrace } from "../../../src/features/player/observability/browserStageTrace.ts";
import { parseBrowserStageTraceConfig } from "../../../src/features/player/observability/browserStageTraceConfig.ts";
import { createStageTraceFiles, createStageTraceArchive } from "../../../src/features/player/observability/stageTraceExport.ts";

const config = { timing_method: "execution-v2" as const, every_nth_frame: 1, max_frames: 2000, max_events: 10000 };
function snapshot(recording: BrowserStageTraceRecording) {
  recording.finish(); return recording.snapshot("a".repeat(40), "synthetic");
}
function fakeVideo() {
  let callback: ((now: number, metadata: { presentationTime: number; presentedFrames: number }) => void) | undefined;
  return {
    video: {
      requestVideoFrameCallback(next: NonNullable<typeof callback>) { callback = next; return 1; },
      cancelVideoFrameCallback() { callback = undefined; },
    },
    get callback() { return callback!; },
    fire(now: number, presentationTime: number, presentedFrames: number) {
      const next = callback!; callback = undefined; next(now, { presentationTime, presentedFrames });
    },
  };
}

test("execution mode is explicit; disabled ignores its knob and v1 stays default", () => {
  assert.equal(parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE_METHOD: "bad" }), null);
  assert.equal(parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: "1" })!.timing_method, undefined);
  assert.deepEqual(parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: "1", VITE_N4_STAGE_TRACE_METHOD: "execution-v2" }), config);
  for (const value of ["execution-v1", "execution-v2\n", 2, true, null]) {
    assert.throws(() => parseBrowserStageTraceConfig({ VITE_N4_STAGE_TRACE: "1", VITE_N4_STAGE_TRACE_METHOD: value }));
    assert.throws(() => new BrowserStageTraceRecording({ ...config, timing_method: value as never }));
  }
});

test("entry is read before metadata and v1 never performs an extra clock read", () => {
  for (const execution of [false, true]) {
    const fake = fakeVideo(); let reads = 0;
    const recording = new BrowserStageTraceRecording({ ...config, timing_method: execution ? "execution-v2" : "api-v1" });
    attachBrowserStageTrace(fake.video, recording, () => ++reads === 1 ? 0 : 10.4);
    const metadata = { get presentationTime() { assert.equal(reads, execution ? 2 : 1); return 10.05; }, presentedFrames: 1 };
    fake.callback(10, metadata);
    const value = snapshot(recording); const events = value.streams[0]!.events;
    assert.equal(events.length, execution ? 3 : 2);
    assert.equal(events[0]!.timestamp_ns, 10050000);
    assert.equal(events[1]!.timestamp_ns, 10000000);
    if (execution) assert.equal(events[2]!.timestamp_ns, 10400000);
    assert.equal(value.schema_version, execution ? "stage-trace-record-v2" : "stage-trace-record-v1");
    assert.equal(reads, execution ? 2 : 1);
  }
});

for (const value of [NaN, Infinity, undefined, "throw"]) test(`entry clock failure ${value} retains API evidence and accounts missing endpoint`, () => {
  const fake = fakeVideo(); let reads = 0;
  const recording = new BrowserStageTraceRecording(config);
  attachBrowserStageTrace(fake.video, recording, () => {
    if (++reads === 1) return 0;
    if (value === "throw") throw new Error("clock failed");
    return value as number;
  });
  fake.fire(10, 10.05, 1);
  const stream = snapshot(recording).streams[0]!;
  assert.equal(stream.events.length, 2);
  assert.equal(stream.loss.attempted_events, 3);
  assert.equal(stream.loss.event_invalid_timestamp_dropped, 1);
  assert.equal(stream.loss.retained_events, 2);
});

test("clock regression including unsampled callbacks closes the lifetime", () => {
  const recording = new BrowserStageTraceRecording({ ...config, every_nth_frame: 2 });
  const first = recording.begin(0, true)!;
  assert.equal(first.observe(10, 10.05, 1, 10.4), true);
  assert.equal(first.observe(20, 20, 2, 20.4), true);
  assert.equal(first.observe(30, 30, 3, 20.3), false);
  const fresh = recording.begin(100, true)!;
  assert.equal(fresh.observe(110, 110, 1, 110.2), true);
  const streams = snapshot(recording).streams;
  assert.equal(streams[0]!.stop_reason, "source_error");
  assert.equal(streams[0]!.loss.offered_frames, 2);
  assert.equal(streams[0]!.loss.unsampled_frames, 1);
  assert.equal(streams[1]!.clock_id, "clock-2");
});

test("negative pairs and coarse-clock zeros are preserved without clamping", () => {
  const recording = new BrowserStageTraceRecording(config);
  const scope = recording.begin(0, true)!;
  scope.observe(10, 10.05, 1, 10);
  scope.observe(20, 20, 2, 20);
  assert.deepEqual(snapshot(recording).streams[0]!.events.map(event => event.timestamp_ns),
    [10050000, 10000000, 10000000, 20000000, 20000000, 20000000]);
});

test("all three endpoints share global capacity, with exact partial-frame loss", () => {
  const recording = new BrowserStageTraceRecording({ ...config, max_events: 2 });
  assert.equal(recording.begin(0, true)!.observe(10, 10.05, 1, 10.4), false);
  assert.equal(recording.begin(20, true)!.observe(30, 30.05, 1, 30.4), false);
  const streams = snapshot(recording).streams;
  assert.equal(streams[0]!.loss.event_capacity_dropped, 1);
  assert.equal(streams[1]!.loss.event_capacity_dropped, 3);
  assert.equal(streams.flatMap(stream => stream.events).length, 2);
});

test("late callbacks after failed cancellation cannot read the clock or mutate evidence", () => {
  const fake = fakeVideo(); let reads = 0;
  const recording = new BrowserStageTraceRecording(config);
  const stop = attachBrowserStageTrace(fake.video, recording, () => { reads++; return reads * 10; });
  const late = fake.callback;
  fake.video.cancelVideoFrameCallback = () => { throw new Error("cancel"); };
  stop(); stop(); late(20, { presentationTime: 19, presentedFrames: 1 });
  const stream = snapshot(recording).streams[0]!;
  assert.equal(reads, 1); assert.equal(stream.events.length, 0);
});

test("absent API and first registration failure mark both capabilities unavailable", () => {
  for (const video of [{}, { requestVideoFrameCallback() { throw new Error("API"); }, cancelVideoFrameCallback() {} }]) {
    const recording = new BrowserStageTraceRecording(config);
    attachBrowserStageTrace(video, recording, () => 0);
    const stream = snapshot(recording).streams[0]!;
    assert.deepEqual(stream.capabilities.slice(-2).map(cap => cap.reason), ["api_unavailable", "api_unavailable"]);
    assert.equal(stream.frames.length, 0);
  }
});

const pins = {
  paired: "ac735e7f7c6fb0e3e3bce6f644cd11cc5b45d04f3de90c7f65a12948bd854fd5",
  partial: "6dcbcd108a5e2c8791426fdbb826226f098c53d4a28994d8f4ba6bbc0c4f0e65",
  unavailable: "d93c613ddcdb527ab834f47753b7659c5cfcb8da17de69657e981940e63907fb",
};
for (const kind of ["paired", "partial", "unavailable"] as const) test(`independent core fixture parity and versioned export: ${kind}`, async () => {
  function create() {
    const recording = new BrowserStageTraceRecording({ ...config, max_events: kind === "partial" ? 2 : 10000 });
    const scope = recording.begin(0, kind !== "unavailable")!;
    if (kind === "paired") {
      scope.observe(10, 10.05, 1, 10.4);
      scope.observe(20, 20, 2, 20.1);
      scope.observe(30.1, 30.2, 3, 30.1);
      scope.observe(40.2, 40, 4);
    } else if (kind === "partial") scope.observe(10, 10.05, 1, 10.4);
    return recording;
  }
  const files = await createStageTraceFiles(create(), "a".repeat(40), "synthetic");
  assert.equal(createHash("sha256").update(files[1]!.data).digest("hex"), pins[kind]);
  const manifest = JSON.parse(new TextDecoder().decode(files[0]!.data));
  assert.equal(manifest.schema_version, 2); assert.equal(manifest.trace_schema_version, "stage-trace-record-v2");
  if (process.env.N4_BROWSER_EXECUTION_BUNDLES_DIR) {
    const directory = process.env.N4_BROWSER_EXECUTION_BUNDLES_DIR;
    mkdirSync(directory, { recursive: true });
    const archive = await createStageTraceArchive(create(), "a".repeat(40), "synthetic");
    writeFileSync(join(directory, `${kind}.tar.gz`), new Uint8Array(await archive.arrayBuffer()));
  }
});
