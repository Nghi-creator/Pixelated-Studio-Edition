import type { ResearchRunPhase } from "../../research-mode/researchRunConfig.ts";
import {
  BROWSER_RESEARCH_METRIC_KEYS,
  ENCODER_RESEARCH_METRIC_KEYS,
  ENGINE_RESEARCH_METRIC_KEYS,
} from "../../research-mode/researchTelemetryContract.ts";
import { engineResearchTelemetrySamplesToCsv } from "../telemetry/engineResearchTelemetry.ts";
import type { EngineResearchTelemetrySample } from "../telemetry/engineResearchTelemetry.ts";
import {
  addPacketLossDeltas,
  streamTelemetrySamplesToCsv,
} from "../telemetry/streamTelemetryExport.ts";
import type {
  StreamTelemetryCsvSample,
  StreamTelemetryGraphSample,
} from "../telemetry/streamTelemetryExport.ts";
import type { StreamTelemetryHistorySample } from "../hooks/telemetry/useStreamTelemetryHistory.ts";
import { createStreamTelemetryGraphPngBytes } from "../telemetry/streamTelemetryGraphPng.ts";
import { createResearchBundleV2Files } from "./researchBundleV2.ts";
import type { ResearchBundleManifest } from "./researchBundleManifest.ts";
import type { ResearchRunBundleFile } from "./researchRunBundle.ts";
import { researchRunEventsToCsv } from "./researchRunEvents.ts";
import type { ResearchRunEvent } from "./researchRunEvents.ts";

type BuildResearchGraphOptions = {
  gameTitle: string;
  history: StreamTelemetryHistorySample[];
  playerMode: "guest" | "host";
  samples: StreamTelemetryCsvSample[];
  status: string;
};

export function buildResearchRunGraphPng({
  gameTitle,
  history,
  playerMode,
  samples,
  status,
}: BuildResearchGraphOptions) {
  const graphSamples: StreamTelemetryGraphSample[] =
    samples.length > 0
      ? addPacketLossDeltas(samples)
      : history.map((sample, index) => ({
          bitrateKbps: sample.bitrateKbps,
          elapsedMs: index * 1000,
          fps: sample.fps,
          jitterMs: sample.jitterMs,
          packetsLostDelta:
            index === 0
              ? sample.packetsLost
              : Math.max(
                  0,
                  sample.packetsLost -
                    (history[index - 1]?.packetsLost ?? sample.packetsLost),
                ),
          packetsLostTotal: sample.packetsLost,
        }));
  return createStreamTelemetryGraphPngBytes(graphSamples, {
    gameTitle,
    playerMode,
    status,
  });
}

function measurementSupport(
  samples: StreamTelemetryCsvSample[],
  engineSamples: EngineResearchTelemetrySample[],
): ResearchBundleManifest["measurementSupport"] {
  return Object.fromEntries([
    ...(["bitrateKbps", "fps", "jitterMs", "packetsLostDelta"] as const).map(
      (metric) => [
        `browser_webrtc.${metric}`,
        samples.some((sample) => sample[metric] !== null)
          ? "supported"
          : "unavailable",
      ],
    ),
    ...BROWSER_RESEARCH_METRIC_KEYS.map((metric) => [
      `browser_webrtc.${metric}`,
      samples.some((sample) => sample[metric] !== null)
        ? "supported"
        : "unavailable",
    ]),
    ...ENGINE_RESEARCH_METRIC_KEYS.map((metric) => [
      `engine_runtime.${metric}`,
      engineSamples.some(
        (sample) =>
          sample.source === "engine_runtime" &&
          sample.available &&
          sample[metric] !== null,
      )
        ? "supported"
        : "unavailable",
    ]),
    ...ENCODER_RESEARCH_METRIC_KEYS.map((metric) => [
      `encoder_pipeline.${metric}`,
      metric === "pipelineDelayProxyMs"
        ? "unsupported"
        : engineSamples.some(
              (sample) =>
                sample.source === "encoder_pipeline" &&
                sample.available &&
                sample[metric] !== null,
            )
          ? "supported"
          : "unavailable",
    ]),
  ]) as ResearchBundleManifest["measurementSupport"];
}

export function createResearchRunExportArtifacts({
  baselineJson,
  comparisonCaseId,
  engineSamples,
  events,
  graphPng,
  metadataJson,
  phase,
  recordedAt,
  runId,
  samples,
  summaryJson,
}: {
  baselineJson?: string;
  comparisonCaseId: string;
  engineSamples: EngineResearchTelemetrySample[];
  events: ResearchRunEvent[];
  graphPng: Uint8Array | null;
  metadataJson: string;
  phase: ResearchRunPhase;
  recordedAt: Date;
  runId: string;
  samples: StreamTelemetryCsvSample[];
  summaryJson: string;
}): ResearchRunBundleFile[] {
  const sanitizedSamples = samples.map((sample) => ({
    ...sample,
    lastEngineError: null,
  }));
  const sanitizedEngineSamples = engineSamples.map((sample) => ({
    ...sample,
    error: sample.available ? null : "telemetry unavailable",
  }));
  const contentFiles: ResearchRunBundleFile[] = [
    { data: metadataJson, name: "run-metadata.json" },
    {
      data: streamTelemetrySamplesToCsv(sanitizedSamples),
      name: "stream-telemetry.csv",
    },
    { data: researchRunEventsToCsv(events), name: "stream-events.csv" },
    { data: summaryJson, name: "summary.json" },
    {
      data: engineResearchTelemetrySamplesToCsv(sanitizedEngineSamples),
      name: "engine-telemetry.csv",
    },
  ];
  if (baselineJson !== undefined) {
    contentFiles.push({ data: baselineJson, name: "browser-baseline.json" });
  }
  if (graphPng) {
    contentFiles.push({ data: graphPng, name: "performance-network.png" });
  }

  return createResearchBundleV2Files({
    comparisonCaseId,
    contentFiles,
    createdAt: recordedAt,
    measurementSupport: measurementSupport(samples, engineSamples),
    phase,
    runId,
    telemetrySources: {
      browser_webrtc: samples.length > 0 ? "supported" : "unavailable",
      encoder_pipeline: engineSamples.some(
        (sample) => sample.source === "encoder_pipeline" && sample.available,
      )
        ? "supported"
        : "unavailable",
      engine_runtime: engineSamples.some(
        (sample) => sample.source === "engine_runtime" && sample.available,
      )
        ? "supported"
        : "unavailable",
    },
  });
}

export function selectResearchRunCsvFiles(files: ResearchRunBundleFile[]) {
  return files.filter(
    (file): file is ResearchRunBundleFile & { data: string } =>
      file.name.toLowerCase().endsWith(".csv") && typeof file.data === "string",
  );
}
