import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import {
  createResearchBaseline,
  createResearchBaselineFilename,
  researchBaselineToJson,
  type ResearchBaselineForm,
} from "../researchBaseline";
import {
  createResearchRunBundleFilename,
  createResearchRunBundleTar,
  type ResearchRunBundleFile,
} from "../researchRunBundle";
import {
  createResearchRunEventsFilename,
  findFirstEventElapsedMs,
  researchRunEventsToCsv,
  type ResearchRunEvent,
} from "../researchRunEvents";
import {
  createResearchRunMetadata,
  createResearchRunMetadataFilename,
  researchRunMetadataToJson,
  type ResearchRunMetadataForm,
} from "../researchRunMetadata";
import {
  createResearchRunSummary,
  createResearchRunSummaryFilename,
  researchRunSummaryToJson,
} from "../researchRunSummary";
import { renderStreamTelemetryGraphPng } from "../streamTelemetryGraphPng";
import {
  addPacketLossDeltas,
  latestStreamTelemetryGraphSamples,
  STREAM_TELEMETRY_GRAPH_WINDOW_MS,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
} from "../streamTelemetryExport";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, type: string) {
  downloadBlob(filename, new Blob([text], { type }));
}

function dataUrlToBytes(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function useResearchRunExports({
  baselineForm,
  events,
  form,
  gameId,
  gameTitle,
  playerMode,
  recordedCsvSamples,
  runId,
  sessionId,
  shareUrl,
  status,
  streamProfile,
}: {
  baselineForm: ResearchBaselineForm;
  events: ResearchRunEvent[];
  form: ResearchRunMetadataForm;
  gameId: string | undefined;
  gameTitle: string;
  playerMode: "guest" | "host";
  recordedCsvSamples: StreamTelemetryCsvSample[];
  runId: string;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
}) {
  const isBrowserBaseline = form.scenario === "browser_only_baseline";

  const createMetadata = (capturedAt: Date) =>
    createResearchRunMetadata({
      capturedAt,
      form,
      gameId,
      gameTitle,
      playerMode,
      runId,
      sessionId,
      shareUrl,
      status,
      streamProfile,
      userAgent: navigator.userAgent,
    });

  const buildMetadataJson = (capturedAt: Date) =>
    researchRunMetadataToJson(createMetadata(capturedAt));

  const buildBaselineJson = (capturedAt: Date) =>
    researchBaselineToJson(
      createResearchBaseline({
        capturedAt,
        form: baselineForm,
        metadata: createMetadata(capturedAt),
        userAgent: navigator.userAgent,
      }),
    );

  const createSummary = (generatedAt = new Date()) =>
    createResearchRunSummary({
      events,
      generatedAt,
      runId,
      samples: recordedCsvSamples,
      sessionId,
    });

  const buildSummaryJson = (generatedAt: Date) =>
    researchRunSummaryToJson(createSummary(generatedAt));

  const buildGraphPng = () => {
    const graphSamples = latestStreamTelemetryGraphSamples(
      addPacketLossDeltas(recordedCsvSamples),
    );
    const dataUrl = renderStreamTelemetryGraphPng(graphSamples, {
      gameTitle,
      graphWindowSeconds: STREAM_TELEMETRY_GRAPH_WINDOW_MS / 1000,
      playerMode,
      sampleCount: graphSamples.length,
      status,
    });

    return dataUrl ? dataUrlToBytes(dataUrl) : null;
  };

  const exportMetadata = () => {
    const capturedAt = new Date();
    downloadText(
      createResearchRunMetadataFilename({ gameId, recordedAt: capturedAt, runId }),
      buildMetadataJson(capturedAt),
      "application/json;charset=utf-8",
    );
  };

  const exportEvents = () => {
    const capturedAt = new Date();
    downloadText(
      createResearchRunEventsFilename({ gameId, recordedAt: capturedAt, runId }),
      researchRunEventsToCsv(events),
      "text/csv;charset=utf-8",
    );
  };

  const exportSummary = () => {
    const generatedAt = new Date();
    downloadText(
      createResearchRunSummaryFilename({ gameId, recordedAt: generatedAt, runId }),
      buildSummaryJson(generatedAt),
      "application/json;charset=utf-8",
    );
  };

  const exportBaseline = () => {
    const capturedAt = new Date();
    downloadText(
      createResearchBaselineFilename({ gameId, recordedAt: capturedAt, runId }),
      buildBaselineJson(capturedAt),
      "application/json;charset=utf-8",
    );
  };

  const exportBundle = () => {
    const recordedAt = new Date();
    const files: ResearchRunBundleFile[] = [
      {
        data: buildMetadataJson(recordedAt),
        name: "run-metadata.json",
      },
      {
        data: streamTelemetrySamplesToCsv(recordedCsvSamples),
        name: "stream-telemetry.csv",
      },
      {
        data: researchRunEventsToCsv(events),
        name: "stream-events.csv",
      },
      {
        data: buildSummaryJson(recordedAt),
        name: "summary.json",
      },
    ];

    if (isBrowserBaseline) {
      files.push({
        data: buildBaselineJson(recordedAt),
        name: "browser-baseline.json",
      });
    }

    const graphPng = buildGraphPng();
    if (graphPng) {
      files.push({
        data: graphPng,
        name: "performance-network.png",
      });
    }

    downloadBlob(
      createResearchRunBundleFilename({ gameId, recordedAt, runId }),
      new Blob([createResearchRunBundleTar(files, recordedAt)], {
        type: "application/x-tar",
      }),
    );
  };

  return {
    canExportBundle:
      isBrowserBaseline || events.length > 0 || recordedCsvSamples.length > 0,
    canExportEvents: events.length > 0,
    canExportSummary: events.length > 0 || recordedCsvSamples.length > 0,
    exportBaseline,
    exportBundle,
    exportEvents,
    exportMetadata,
    exportSummary,
    firstFrameElapsedMs: findFirstEventElapsedMs(
      events,
      "first_non_black_frame",
    ),
    isBrowserBaseline,
    pythonReadyElapsedMs: findFirstEventElapsedMs(events, "python_ready"),
    startGameElapsedMs: findFirstEventElapsedMs(events, "start_game_emitted"),
    summary: createSummary(),
  };
}
