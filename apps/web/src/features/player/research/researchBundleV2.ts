import {
  createResearchBundleManifest,
  RESEARCH_BUNDLE_V2_REQUIRED_FILES,
  type ResearchBundleManifest,
} from "./researchBundleManifest.ts";
import type { ResearchRunBundleFile } from "./researchRunBundle.ts";
import type { ResearchRunPhase } from "../../research-mode/researchRunConfig.ts";

function mediaType(name: string) {
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

export function createResearchBundleV2Files({
  comparisonCaseId,
  contentFiles,
  createdAt,
  measurementSupport,
  phase,
  runId,
  telemetrySources,
}: {
  comparisonCaseId: string;
  contentFiles: ResearchRunBundleFile[];
  createdAt: Date;
  measurementSupport: ResearchBundleManifest["measurementSupport"];
  phase: ResearchRunPhase;
  runId: string;
  telemetrySources: ResearchBundleManifest["telemetrySources"];
}): ResearchRunBundleFile[] {
  const contentNames = new Set(contentFiles.map((file) => file.name));
  const missing = RESEARCH_BUNDLE_V2_REQUIRED_FILES.filter(
    (name) => name !== "bundle-manifest.json" && !contentNames.has(name),
  );
  if (missing.length > 0) {
    throw new Error(`Research bundle v2 is missing: ${missing.join(", ")}`);
  }
  const allNames = ["bundle-manifest.json", ...contentFiles.map((file) => file.name)];
  const requiredNames = new Set<string>(RESEARCH_BUNDLE_V2_REQUIRED_FILES);
  const manifest = createResearchBundleManifest({
    comparisonCaseId,
    createdAt,
    files: allNames.map((name) => ({
      mediaType: mediaType(name),
      name,
      required: requiredNames.has(name),
    })),
    measurementSupport,
    phase,
    runId,
    telemetrySources,
  });
  return [
    {
      data: `${JSON.stringify(manifest, null, 2)}\n`,
      name: "bundle-manifest.json",
    },
    ...contentFiles,
  ];
}
