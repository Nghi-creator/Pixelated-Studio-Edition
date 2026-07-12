import { useCallback, useMemo } from "react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import { downloadBlob, downloadText } from "../downloadFile";
import {
  createResearchBaseline,
  createResearchBaselineFilename,
  researchBaselineToJson,
  type ResearchBaselineForm,
} from "../research/researchBaseline";
import {
  createResearchRunBundleFilename,
  createResearchRunBundleTar,
  type ResearchRunBundleFile,
} from "../research/researchRunBundle";
import {
  createResearchRunEventsFilename,
  findFirstEventElapsedMs,
  researchRunEventsToCsv,
  type ResearchRunEvent,
} from "../research/researchRunEvents";
import {
  createResearchRunMetadata,
  createResearchRunMetadataFilename,
  researchRunMetadataToJson,
  type ResearchRunMetadataForm,
} from "../research/researchRunMetadata";
import {
  createResearchRunSummary,
  createResearchRunSummaryFilename,
  researchRunSummaryToJson,
} from "../research/researchRunSummary";
import { createStreamTelemetryGraphPngBytes } from "../telemetry/streamTelemetryGraphPng";
import {
  addPacketLossDeltas,
  createStreamTelemetryGraphFilename,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
  type StreamTelemetryGraphSample,
} from "../telemetry/streamTelemetryExport";
import type { StreamTelemetryHistorySample } from "./useStreamTelemetryHistory";

export function useResearchRunExports({
  baselineForm,
  events,
  form,
  gameId,
  gameTitle,
  history,
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
  history: StreamTelemetryHistorySample[];
  playerMode: "guest" | "host";
  recordedCsvSamples: StreamTelemetryCsvSample[];
  runId: string;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
}) {
  const isBrowserBaseline = form.scenario === "browser_only_baseline";

  const createMetadata = useCallback((capturedAt: Date) =>
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
    }), [
      form,
      gameId,
      gameTitle,
      playerMode,
      runId,
      sessionId,
      shareUrl,
      status,
      streamProfile,
    ]);

  const buildMetadataJson = useCallback(
    (capturedAt: Date) => researchRunMetadataToJson(createMetadata(capturedAt)),
    [createMetadata],
  );

  const buildBaselineJson = useCallback(
    (capturedAt: Date) => researchBaselineToJson(
      createResearchBaseline({
        capturedAt,
        form: baselineForm,
        metadata: createMetadata(capturedAt),
        userAgent: navigator.userAgent,
      }),
    ),
    [baselineForm, createMetadata],
  );

  const createSummary = useCallback((generatedAt = new Date()) =>
    createResearchRunSummary({
      events,
      generatedAt,
      runId,
      samples: recordedCsvSamples,
      sessionId,
    }), [events, recordedCsvSamples, runId, sessionId]);

  const buildSummaryJson = useCallback(
    (generatedAt: Date) => researchRunSummaryToJson(createSummary(generatedAt)),
    [createSummary],
  );

  const buildGraphPng = useCallback(() => {
    const graphSamples: StreamTelemetryGraphSample[] =
      recordedCsvSamples.length > 0
        ? addPacketLossDeltas(recordedCsvSamples)
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
                    sample.packetsLost - history[index - 1].packetsLost,
                  ),
            packetsLostTotal: sample.packetsLost,
          }));

    return createStreamTelemetryGraphPngBytes(graphSamples, {
      gameTitle,
      playerMode,
      status,
    });
  }, [gameTitle, history, playerMode, recordedCsvSamples, status]);

  const summary = useMemo(() => createSummary(), [createSummary]);

  const exportMetadata = useCallback(async () => {
    const capturedAt = new Date();
    await downloadText(
      createResearchRunMetadataFilename({ gameId, recordedAt: capturedAt, runId }),
      buildMetadataJson(capturedAt),
      "application/json;charset=utf-8",
    );
  }, [buildMetadataJson, gameId, runId]);

  const exportEvents = useCallback(async () => {
    const capturedAt = new Date();
    await downloadText(
      createResearchRunEventsFilename({ gameId, recordedAt: capturedAt, runId }),
      researchRunEventsToCsv(events),
      "text/csv;charset=utf-8",
    );
  }, [events, gameId, runId]);

  const exportSummary = useCallback(async () => {
    const generatedAt = new Date();
    await downloadText(
      createResearchRunSummaryFilename({ gameId, recordedAt: generatedAt, runId }),
      buildSummaryJson(generatedAt),
      "application/json;charset=utf-8",
    );
  }, [buildSummaryJson, gameId, runId]);

  const exportBaseline = useCallback(async () => {
    const capturedAt = new Date();
    await downloadText(
      createResearchBaselineFilename({ gameId, recordedAt: capturedAt, runId }),
      buildBaselineJson(capturedAt),
      "application/json;charset=utf-8",
    );
  }, [buildBaselineJson, gameId, runId]);

  const exportGraph = useCallback(async () => {
    const graphPng = buildGraphPng();
    if (!graphPng) return;

    await downloadBlob(
      createStreamTelemetryGraphFilename({ gameId, sessionId }),
      new Blob([graphPng], { type: "image/png" }),
    );
  }, [buildGraphPng, gameId, sessionId]);

  const exportBundle = useCallback(async () => {
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

    await downloadBlob(
      createResearchRunBundleFilename({ gameId, recordedAt, runId }),
      new Blob([createResearchRunBundleTar(files, recordedAt)], {
        type: "application/x-tar",
      }),
    );
  }, [
    buildBaselineJson,
    buildGraphPng,
    buildMetadataJson,
    buildSummaryJson,
    events,
    gameId,
    isBrowserBaseline,
    recordedCsvSamples,
    runId,
  ]);

  return {
    canExportBundle:
      isBrowserBaseline ||
      events.length > 0 ||
      recordedCsvSamples.length > 0 ||
      history.length > 0,
    canExportEvents: events.length > 0,
    canExportGraph: recordedCsvSamples.length > 0 || history.length > 0,
    canExportSummary: events.length > 0 || recordedCsvSamples.length > 0,
    exportBaseline,
    exportBundle,
    exportEvents,
    exportGraph,
    exportMetadata,
    exportSummary,
    firstFrameElapsedMs: findFirstEventElapsedMs(
      events,
      "first_non_black_frame",
    ),
    isBrowserBaseline,
    pythonReadyElapsedMs: findFirstEventElapsedMs(events, "python_ready"),
    startGameElapsedMs: findFirstEventElapsedMs(events, "start_game_emitted"),
    summary,
  };
}
