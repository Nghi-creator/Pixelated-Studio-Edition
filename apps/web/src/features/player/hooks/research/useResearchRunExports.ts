import { useCallback, useMemo } from "react";
import type { StreamProfile } from "../../../../lib/engine/streamProfiles";
import type { ResearchRunPhase } from "../../../research-mode/researchRunConfig";
import { downloadBlob, downloadText } from "../../downloadFile";
import {
  createResearchBaseline,
  createResearchBaselineFilename,
  researchBaselineToJson,
  sanitizeResearchBaseline,
  sanitizedResearchBaselineToJson,
  type ResearchBaselineForm,
} from "../../research/researchBaseline";
import {
  createResearchRunBundleFilename,
  createResearchRunBundleTar,
  createResearchRunCsvFilename,
} from "../../research/researchRunBundle";
import {
  buildResearchRunGraphPng,
  createResearchRunExportArtifacts,
  selectResearchRunCsvFiles,
} from "../../research/researchRunExportArtifacts";
import {
  createResearchRunEventsFilename,
  findFirstEventElapsedMs,
  researchRunEventsToCsv,
  type ResearchRunEvent,
} from "../../research/researchRunEvents";
import {
  createResearchRunMetadata,
  createResearchRunMetadataFilename,
  researchRunMetadataToJson,
  sanitizeResearchRunMetadata,
  sanitizedResearchRunMetadataToJson,
  type ResearchRunMetadataForm,
} from "../../research/researchRunMetadata";
import {
  createResearchRunSummary,
  createResearchRunSummaryFilename,
  researchRunSummaryToJson,
} from "../../research/researchRunSummary";
import {
  createStreamTelemetryGraphFilename,
  type StreamTelemetryCsvSample,
} from "../../telemetry/streamTelemetryExport";
import type { StreamTelemetryHistorySample } from "../telemetry/useStreamTelemetryHistory";
import type { EngineResearchTelemetrySample } from "../../telemetry/engineResearchTelemetry";

export function useResearchRunExports({
  baselineForm,
  comparisonCaseId,
  events,
  form,
  gameId,
  gameTitle,
  history,
  playerMode,
  phase = "custom",
  recordedEngineSamples = [],
  recordedCsvSnapshot,
  runId,
  sessionId,
  shareUrl,
  status,
  streamProfile,
}: {
  baselineForm: ResearchBaselineForm;
  comparisonCaseId?: string;
  events: ResearchRunEvent[];
  form: ResearchRunMetadataForm;
  gameId: string | undefined;
  gameTitle: string;
  history: StreamTelemetryHistorySample[];
  playerMode: "guest" | "host";
  phase?: ResearchRunPhase;
  recordedEngineSamples?: EngineResearchTelemetrySample[];
  recordedCsvSnapshot: {
    revision: number;
    samples: StreamTelemetryCsvSample[];
  };
  runId: string;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: StreamProfile;
}) {
  const isBrowserBaseline = form.scenario === "browser_only_baseline";
  const requiresComputeTelemetry = !isBrowserBaseline;
  const resolvedComparisonCaseId = comparisonCaseId?.trim() || runId;
  const recordedCsvSamples = recordedCsvSnapshot.samples;
  const latestCapturedAt = recordedCsvSamples.at(-1)?.capturedAt;
  const getRecordedCsvSamples = useCallback(
    () => recordedCsvSnapshot.samples,
    [recordedCsvSnapshot],
  );

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

  const sanitizedBundleMetadata = useMemo(
    () =>
      sanitizeResearchRunMetadata(
        createMetadata(latestCapturedAt ? new Date(latestCapturedAt) : new Date()),
      ),
    [createMetadata, latestCapturedAt],
  );
  const bundleMetadataJson = useMemo(
    () => sanitizedResearchRunMetadataToJson(sanitizedBundleMetadata),
    [sanitizedBundleMetadata],
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

  const buildSanitizedBaselineJson = useCallback(
    (capturedAt: Date) =>
      sanitizedResearchBaselineToJson(
        sanitizeResearchBaseline(
          createResearchBaseline({
            capturedAt,
            form: baselineForm,
            metadata: createMetadata(capturedAt),
            userAgent: navigator.userAgent,
          }),
        ),
      ),
    [baselineForm, createMetadata],
  );

  const createSummary = useCallback((generatedAt = new Date()) =>
    createResearchRunSummary({
      engineSamples: recordedEngineSamples,
      events,
      generatedAt,
      requiresComputeTelemetry,
      runId,
      samples: getRecordedCsvSamples(),
      sessionId,
    }), [
      events,
      getRecordedCsvSamples,
      recordedEngineSamples,
      requiresComputeTelemetry,
      runId,
      sessionId,
    ]);

  const buildSummaryJson = useCallback(
    (generatedAt: Date) => researchRunSummaryToJson(createSummary(generatedAt)),
    [createSummary],
  );

  const buildGraphPng = useCallback(() => {
    return buildResearchRunGraphPng({
      gameTitle,
      history,
      playerMode,
      samples: getRecordedCsvSamples(),
      status,
    });
  }, [
    gameTitle,
    getRecordedCsvSamples,
    history,
    playerMode,
    status,
  ]);

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

  const buildExportArtifacts = useCallback(
    (recordedAt: Date) => createResearchRunExportArtifacts({
      baselineJson: isBrowserBaseline
        ? buildSanitizedBaselineJson(recordedAt)
        : undefined,
      comparisonCaseId: resolvedComparisonCaseId,
      engineSamples: recordedEngineSamples,
      events,
      graphPng: buildGraphPng(),
      metadataJson: bundleMetadataJson,
      phase,
      recordedAt,
      runId,
      samples: getRecordedCsvSamples(),
      summaryJson: buildSummaryJson(recordedAt),
    }),
    [
      buildSanitizedBaselineJson,
      buildGraphPng,
      buildSummaryJson,
      bundleMetadataJson,
      events,
      getRecordedCsvSamples,
      isBrowserBaseline,
      phase,
      recordedEngineSamples,
      resolvedComparisonCaseId,
      runId,
    ],
  );

  const exportBundle = useCallback(async () => {
    const recordedAt = new Date();

    await downloadBlob(
      createResearchRunBundleFilename({ gameId, phase, recordedAt, runId }),
      new Blob([createResearchRunBundleTar(buildExportArtifacts(recordedAt), recordedAt)], {
        type: "application/x-tar",
      }),
    );
  }, [
    buildExportArtifacts,
    gameId,
    phase,
    runId,
  ]);

  const exportCsvFiles = useCallback(async () => {
    const recordedAt = new Date();
    const csvFiles = selectResearchRunCsvFiles(
      buildExportArtifacts(recordedAt),
    );

    for (const file of csvFiles) {
      await downloadText(
        createResearchRunCsvFilename({
          artifactName: file.name,
          gameId,
          phase,
          recordedAt,
          runId,
        }),
        file.data,
        "text/csv;charset=utf-8",
      );
    }
  }, [buildExportArtifacts, gameId, phase, runId]);

  return {
    canExportBundle:
      isBrowserBaseline ||
      events.length > 0 ||
      recordedCsvSamples.length > 0 ||
      history.length > 0,
    canExportEvents: events.length > 0,
    canExportGraph: recordedCsvSamples.length > 0 || history.length > 0,
    canExportSummary: events.length > 0 || recordedCsvSamples.length > 0,
    bundleMetadataJson,
    exportBaseline,
    exportBundle,
    exportCsvFiles,
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
  };
}
