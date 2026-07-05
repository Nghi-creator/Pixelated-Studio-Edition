import {
  Clipboard,
  Download,
  FlaskConical,
  Radio,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";

export function StreamTelemetryControls({
  copyState,
  csvState,
  isRecordingCsv,
  recordedCsvSampleCount,
  onClearTelemetryCsv,
  onCopyTelemetry,
  onExportTelemetryCsv,
  onOpenResearch,
  onResetTelemetryData,
  onToggleCsvRecording,
}: {
  copyState: "copied" | "failed" | "idle" | "saved";
  csvState: "exported" | "failed" | "idle";
  isRecordingCsv: boolean;
  recordedCsvSampleCount: number;
  onClearTelemetryCsv: () => void;
  onCopyTelemetry: () => void;
  onExportTelemetryCsv: () => void;
  onOpenResearch: () => void;
  onResetTelemetryData: () => void;
  onToggleCsvRecording: () => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-1.5">
      <button
        aria-label="Reset stream telemetry data"
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
        onClick={onResetTelemetryData}
        title="Reset stream telemetry data"
        type="button"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Reset</span>
      </button>
      <button
        aria-label="Copy stream telemetry JSON"
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
        onClick={onCopyTelemetry}
        title="Copy stream telemetry JSON"
        type="button"
      >
        <Clipboard className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {copyState === "copied"
            ? "Copied"
            : copyState === "saved"
              ? "Saved"
              : copyState === "failed"
                ? "Failed"
                : "Copy"}
        </span>
      </button>
      <button
        aria-label="Open research run metadata"
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
        onClick={onOpenResearch}
        title="Open research run metadata"
        type="button"
      >
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Research</span>
      </button>
      <button
        aria-label={
          isRecordingCsv
            ? "Stop recording stream telemetry CSV"
            : "Start recording stream telemetry CSV"
        }
        aria-pressed={isRecordingCsv}
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white"
        onClick={onToggleCsvRecording}
        title={
          isRecordingCsv
            ? "Stop recording stream telemetry CSV"
            : "Start recording stream telemetry CSV"
        }
        type="button"
      >
        {isRecordingCsv ? (
          <Square className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Radio className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{isRecordingCsv ? "Stop" : "CSV"}</span>
      </button>
      <button
        aria-label="Export recorded stream telemetry CSV"
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={recordedCsvSampleCount === 0}
        onClick={onExportTelemetryCsv}
        title="Export recorded stream telemetry CSV"
        type="button"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {csvState === "exported"
            ? "Done"
            : csvState === "failed"
              ? "Failed"
              : recordedCsvSampleCount > 0
                ? String(recordedCsvSampleCount)
                : "Export"}
        </span>
      </button>
      <button
        aria-label="Clear recorded stream telemetry CSV samples"
        className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:bg-synth-elevated hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={recordedCsvSampleCount === 0 && !isRecordingCsv}
        onClick={onClearTelemetryCsv}
        title="Clear recorded stream telemetry CSV samples"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Clear</span>
      </button>
    </div>
  );
}
