import { X } from "lucide-react";
import type { WebRTCTelemetry } from "../../../../lib/webrtc/telemetry/webrtcTelemetry";
import { useStreamTelemetryHistory } from "../../hooks/telemetry/useStreamTelemetryHistory";
import { StreamTelemetryHistoryChart } from "./StreamTelemetryHistoryChart";
import { StreamTelemetrySummary } from "./StreamTelemetrySummary";

type StreamTelemetryPanelProps = {
  telemetry: WebRTCTelemetry;
  onClose: () => void;
};

export function StreamTelemetryPanel({
  onClose,
  telemetry,
}: StreamTelemetryPanelProps) {
  const { displayedPacketsLost, history, latestHistorySample } =
    useStreamTelemetryHistory(telemetry);

  return (
    <section className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-synth-border bg-synth-surface p-3 shadow-card sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 xl:static xl:w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-200">
          Stream Stats
        </p>
        <button
          aria-label="Hide stream stats"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:bg-synth-elevated hover:text-white"
          onClick={onClose}
          title="Hide stream stats"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <StreamTelemetrySummary
        displayedPacketsLost={displayedPacketsLost}
        latestHistorySample={latestHistorySample}
        telemetry={telemetry}
      />

      <div className="mt-3 hidden space-y-3 xl:block">
        <StreamTelemetryHistoryChart
          label="Performance · 60s"
          primaryLabel="FPS"
          primaryValues={history.map((sample) => sample.fps)}
          secondaryLabel="kbps"
          secondaryValues={history.map((sample) => sample.bitrateKbps)}
        />
        <StreamTelemetryHistoryChart
          label="Network · 60s"
          primaryLabel="Jitter"
          primaryValues={history.map((sample) => sample.jitterMs)}
          secondaryLabel="Loss"
          secondaryValues={history.map((sample) => sample.packetsLost)}
        />
      </div>
    </section>
  );
}
