import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { BrowserStageTraceRecording } from "../../../src/features/player/observability/browserStageTrace.ts";
import { canonicalStageTraceJson, createStageTraceFiles, createStageTraceArchive } from "../../../src/features/player/observability/stageTraceExport.ts";

function recording() {
  const value = new BrowserStageTraceRecording({ every_nth_frame: 1, max_frames: 2000, max_events: 10000 });
  value.begin(100, true)!.observe(110, 108, 1);
  return value;
}

test("standalone files have exact closed manifest and canonical hash", async () => {
  const value = recording();
  const files = await createStageTraceFiles(value, "a".repeat(40), "synthetic");
  assert.deepEqual(files.map(file => file.name), ["trace-manifest.json", "trace-record.json"]);
  const manifest = JSON.parse(new TextDecoder().decode(files[0]!.data));
  const payload = files[1]!.data;
  assert.deepEqual(manifest, {
    schema_version: 1, bundle_type: "pixelated_stage_trace", trace_schema_version: "stage-trace-record-v1",
    trace_bytes: payload.length, trace_sha256: createHash("sha256").update(payload).digest("hex"),
  });
  assert.equal(value.begin(0, true), null);
  assert.equal(new TextDecoder().decode(payload).endsWith("\n"), true);
  assert.equal(new TextDecoder().decode(payload).includes("100000000"), false);
});

test("canonical integer formatting matches independent sorted JSON text", () => {
  const bytes = canonicalStageTraceJson({ z: [9007199254740991, -0, null], a: { b: true, a: "presentation_proxy" } });
  assert.equal(new TextDecoder().decode(bytes), '{\n  "a": {\n    "a": "presentation_proxy",\n    "b": true\n  },\n  "z": [\n    9007199254740991,\n    0,\n    null\n  ]\n}\n');
});

for (const value of [NaN, Infinity, 1.5, 9007199254740992, undefined, new Date()]) test(`reject non-record numeric/data ${String(value)}`, () => {
  assert.throws(() => canonicalStageTraceJson({ value }));
});

test("JSON depth and bytes are bounded", () => {
  let value: unknown = 0;
  for (let i = 0; i < 33; i++) value = [value];
  assert.throws(() => canonicalStageTraceJson(value));
  assert.throws(() => canonicalStageTraceJson("x".repeat(10 * 1024 * 1024)));
});

test("invalid commit does not stop the recording", async () => {
  const value = recording();
  await assert.rejects(createStageTraceFiles(value, "private-version", "synthetic"));
  assert.ok(value.begin(200, true));
});

test("export before playback does not terminate future collection", async () => {
  const value = new BrowserStageTraceRecording({ every_nth_frame: 1, max_frames: 2000, max_events: 10000 });
  await assert.rejects(createStageTraceFiles(value, "a".repeat(40), "synthetic"));
  assert.ok(value.begin(0, true));
});

test("gzip TAR contains only two fixed regular names, zero mtime, no v2 members", async () => {
  const blob = await createStageTraceArchive(recording(), "a".repeat(40), "synthetic");
  const bytes = gunzipSync(new Uint8Array(await blob.arrayBuffer()));
  const names: string[] = [];
  let offset = 0;
  while (bytes[offset]) {
    const header = bytes.subarray(offset, offset + 512);
    names.push(header.subarray(0, 100).toString().split('\0')[0]!);
    assert.equal(header[156], "0".charCodeAt(0));
    assert.equal(parseInt(header.subarray(136, 148).toString().replaceAll('\0', ''), 8), 0);
    const size = parseInt(header.subarray(124, 136).toString().replaceAll('\0', ''), 8);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.deepEqual(names, ["trace-manifest.json", "trace-record.json"]);
  assert.ok(bytes.subarray(offset).every(byte => byte === 0));
});

for (const suffix of ["\n", "\r\n", "\u2028", "\u2029"]) test(`export rejects commit trailing whitespace before stopping ${JSON.stringify(suffix)}`, async () => {
  const value = recording();
  await assert.rejects(createStageTraceFiles(value, "a".repeat(40) + suffix, "synthetic"));
  assert.ok(value.begin(200, true));
});

test("invalid provenance fails before stopping collection", async () => {
  const value = recording();
  await assert.rejects(createStageTraceFiles(value, "a".repeat(40), "unknown" as never));
  assert.ok(value.begin(200, true));
});
