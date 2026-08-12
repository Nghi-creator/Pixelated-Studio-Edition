import type { WebRTCTelemetry } from "../../../../lib/webrtc/telemetry/webrtcTelemetry";
import { ResearchRunHud } from "../../../research-mode/components/ResearchRunHud";
import { ResearchRunResults } from "../../../research-mode/components/ResearchRunResults";
import type { PlayerResearchSession } from "../../hooks/research/usePlayerResearchSession";

export function ResearchPlayerOutput({
  layoutClassName,
  onRetake,
  onReturnToLibrary,
  session,
  telemetry,
}: {
  layoutClassName: string;
  onRetake: () => void;
  onReturnToLibrary: () => void;
  session: PlayerResearchSession;
  telemetry: WebRTCTelemetry;
}) {
  const { config, controller, engineTelemetry, exports, recording } = session;
  const showResults =
    controller.state.stage === "completed" ||
    controller.state.stage === "invalid" ||
    controller.state.stage === "cancelled";

  return (
    <>
      <div className={`w-full ${layoutClassName}`}>
        <ResearchRunHud
          config={config}
          computeSampleCount={engineTelemetry.validComputeSampleCount}
          onCancel={controller.cancel}
          onStop={controller.stopEarly}
          remainingMs={controller.remainingMs}
          sampleCount={recording.recordedCsvSamples.length}
          state={controller.state}
        />
      </div>

      {showResults && (
        <ResearchRunResults
          canExport={exports.canExportBundle}
          config={config}
          computeSampleCount={engineTelemetry.validComputeSampleCount}
          latestEncoderSample={engineTelemetry.latestEncoderSample}
          latestEngineSample={engineTelemetry.latestEngineSample}
          layoutClassName={layoutClassName}
          metadataPreviewJson={exports.bundleMetadataJson}
          onExport={() => void exports.exportBundle()}
          onExportCsv={() => void exports.exportCsvFiles()}
          onRetake={onRetake}
          onReturnToLibrary={onReturnToLibrary}
          state={controller.state}
          telemetry={telemetry}
        />
      )}
    </>
  );
}
