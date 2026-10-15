import { ENCODER_RESEARCH_METRIC_KEYS, ENGINE_RESEARCH_METRIC_KEYS } from "../../research-mode/researchTelemetryContract.ts";
import type { EngineResearchTelemetrySample } from "./engineResearchTelemetry.ts";

export const ENGINE_TELEMETRY_CSV_HEADERS = [
  "captured_at",
  "elapsed_ms",
  "schema_version",
  "run_id",
  "session_id",
  "game_id",
  "source",
  "available",
  "error",
  "node_cpu_percent",
  "node_rss_mb",
  "emulator_cpu_percent",
  "emulator_rss_mb",
  "camera_cpu_percent",
  "camera_rss_mb",
  "logical_cpu_count",
  "cpu_capacity_cores",
  "runtime_kind",
  "node_running",
  "emulator_running",
  "camera_running",
  "peer_count",
  "frames_in_total",
  "frames_out_total",
  "frames_dropped_total",
  "queue_level_buffers",
  "pipeline_delay_proxy_ms",
  "target_bitrate_kbps",
  "target_fps",
  "cpu_used",
  "max_quantizer",
  "sample_sequence",
  "sample_interval_ms",
] as const;

function csvCell(value: boolean | number | string | null) {
  if (value === null) return "";
  const text =
    typeof value === "string" && /^[=+\-@]/.test(value)
      ? `'${value}`
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function engineResearchTelemetrySamplesToCsv(
  samples: EngineResearchTelemetrySample[],
) {
  const rows = samples.map((sample) =>
    [
      sample.capturedAt,
      sample.elapsedMs,
      sample.schemaVersion,
      sample.runId,
      sample.sessionId,
      sample.gameId,
      sample.source,
      sample.available,
      sample.error,
      ...ENGINE_RESEARCH_METRIC_KEYS.map((field) => sample[field]),
      sample.nodeRunning,
      sample.emulatorRunning,
      sample.cameraRunning,
      sample.peerCount,
      ...ENCODER_RESEARCH_METRIC_KEYS.map((field) => sample[field]),
      sample.sampleSequence ?? null,
      sample.sampleIntervalMs ?? null,
    ]
      .map(csvCell)
      .join(","),
  );
  return [ENGINE_TELEMETRY_CSV_HEADERS.join(","), ...rows].join("\n");
}
