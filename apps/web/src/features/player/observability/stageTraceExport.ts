import { createResearchRunBundleTar } from "../research/researchRunBundle.ts";
import type { ResearchRunBundleFile } from "../research/researchRunBundle.ts";
import type { BrowserStageTraceRecording } from "./browserStageTrace.ts";

const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

function sortedValue(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new Error("N4 JSON exceeds depth limit");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value === 0 ? 0 : value;
  if (Array.isArray(value)) return value.map(item => sortedValue(item, depth + 1));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedValue((value as Record<string, unknown>)[key], depth + 1)]));
  }
  throw new Error("N4 JSON requires closed finite data");
}

export function canonicalStageTraceJson(value: unknown) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(sortedValue(value), null, 2)}\n`);
  if (bytes.length > MAX_JSON_BYTES) throw new Error("N4 JSON exceeds byte limit");
  return bytes;
}

export async function createStageTraceFiles(recording: BrowserStageTraceRecording, producerVersion: string, provenance: "synthetic" | "producer_capture") {
  if (typeof producerVersion !== "string" || !/^[0-9a-f]{40}$/.test(producerVersion)) throw new Error("N4 export requires a producer commit");
  if (!recording.hasLifetimes()) throw new Error("N4 export requires a trace lifetime");
  recording.finish();
  const payload = canonicalStageTraceJson(recording.snapshot(producerVersion, provenance));
  const digest = await crypto.subtle.digest("SHA-256", payload as Uint8Array<ArrayBuffer>);
  const trace_sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return [
    { name: "trace-manifest.json", data: canonicalStageTraceJson({ schema_version: 1, bundle_type: "pixelated_stage_trace", trace_schema_version: "stage-trace-record-v1", trace_sha256, trace_bytes: payload.length }) },
    { name: "trace-record.json", data: payload },
  ] satisfies ResearchRunBundleFile[];
}

export async function createStageTraceArchive(recording: BrowserStageTraceRecording, producerVersion: string, provenance: "synthetic" | "producer_capture") {
  const files = await createStageTraceFiles(recording, producerVersion, provenance);
  // Reuse only the TAR encoder; the independent layout contains no research-v2 members.
  const tar = createResearchRunBundleTar(files, new Date(0));
  if (tar.length > MAX_BUNDLE_BYTES) throw new Error("N4 TAR exceeds byte limit");
  const stream = new Blob([tar as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob();
  if (blob.size > MAX_BUNDLE_BYTES) throw new Error("N4 archive exceeds byte limit");
  return blob;
}
