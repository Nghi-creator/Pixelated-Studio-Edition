import type { ResearchRunPhase } from "../../research-mode/researchRunConfig";
import type { ResearchTelemetrySource } from "../../research-mode/researchTelemetryContract";

export const RESEARCH_BUNDLE_V1_REQUIRED_FILES = [
  "run-metadata.json",
  "stream-telemetry.csv",
  "stream-events.csv",
  "summary.json",
] as const;

export const RESEARCH_BUNDLE_SCHEMA_VERSION = 2 as const;

export const RESEARCH_BUNDLE_V2_REQUIRED_FILES = [
  "bundle-manifest.json",
  ...RESEARCH_BUNDLE_V1_REQUIRED_FILES,
  "engine-telemetry.csv",
] as const;

export type ResearchMeasurementSupport =
  | "supported"
  | "unsupported"
  | "unavailable";

export type ResearchBundleManifest = {
  bundleType: "pixelated_research_run";
  comparisonCaseId: string;
  createdAt: string;
  files: Array<{
    mediaType: string;
    name: string;
    required: boolean;
  }>;
  phase: ResearchRunPhase;
  privacy: {
    omittedFields: string[];
    sanitized: true;
  };
  runId: string;
  schemaVersion: typeof RESEARCH_BUNDLE_SCHEMA_VERSION;
  measurementSupport: Record<string, ResearchMeasurementSupport>;
  telemetrySources: Record<ResearchTelemetrySource, ResearchMeasurementSupport>;
};

export function createResearchBundleManifest({
  comparisonCaseId,
  createdAt = new Date(),
  files,
  measurementSupport = {},
  phase,
  runId,
  telemetrySources,
}: {
  comparisonCaseId: string;
  createdAt?: Date;
  files: ResearchBundleManifest["files"];
  measurementSupport?: ResearchBundleManifest["measurementSupport"];
  phase: ResearchRunPhase;
  runId: string;
  telemetrySources: ResearchBundleManifest["telemetrySources"];
}): ResearchBundleManifest {
  return {
    bundleType: "pixelated_research_run",
    comparisonCaseId,
    createdAt: createdAt.toISOString(),
    files,
    phase,
    privacy: {
      omittedFields: [
        "engineToken",
        "shareUrl",
        "notes",
        "hostname",
        "username",
        "absolutePath",
        "rawPeerId",
        "lastEngineError",
        "telemetryError",
      ],
      sanitized: true,
    },
    runId,
    schemaVersion: RESEARCH_BUNDLE_SCHEMA_VERSION,
    measurementSupport,
    telemetrySources,
  };
}
