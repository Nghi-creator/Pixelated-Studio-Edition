import { useCallback, useMemo } from "react";
import type { StreamProfile } from "../../../lib/engine/streamProfiles";
import { downloadBlob, downloadText } from "../downloadFile";
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
import { createStreamTelemetryGraphPngBytes } from "../streamTelemetryGraphPng";
import {
  addPacketLossDeltas,
  streamTelemetrySamplesToCsv,
  type StreamTelemetryCsvSample,
} from "../streamTelemetryExport";

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
    return createStreamTelemetryGraphPngBytes(addPacketLossDeltas(recordedCsvSamples), {
      gameTitle,
      playerMode,
      status,
    });
  }, [gameTitle, playerMode, recordedCsvSamples, status]);

  const summary = useMemo(() => createSummary(), [createSummary]);

  const exportMetadata = useCallback(() => {
    const capturedAt = new Date();
    downloadText(
      createResearchRunMetadataFilename({ gameId, recordedAt: capturedAt, runId }),
      buildMetadataJson(capturedAt),
      "application/json;charset=utf-8",
    );
  }, [buildMetadataJson, gameId, runId]);

  const exportEvents = useCallback(() => {
    const capturedAt = new Date();
    downloadText(
      createResearchRunEventsFilename({ gameId, recordedAt: capturedAt, runId }),
      researchRunEventsToCsv(events),
      "text/csv;charset=utf-8",
    );
  }, [events, gameId, runId]);

  const exportSummary = useCallback(() => {
    const generatedAt = new Date();
    downloadText(
      createResearchRunSummaryFilename({ gameId, recordedAt: generatedAt, runId }),
      buildSummaryJson(generatedAt),
      "application/json;charset=utf-8",
    );
  }, [buildSummaryJson, gameId, runId]);

  const exportBaseline = useCallback(() => {
    const capturedAt = new Date();
    downloadText(
      createResearchBaselineFilename({ gameId, recordedAt: capturedAt, runId }),
      buildBaselineJson(capturedAt),
      "application/json;charset=utf-8",
    );
  }, [buildBaselineJson, gameId, runId]);

  const exportBundle = useCallback(() => {
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
    summary,
  };
}
