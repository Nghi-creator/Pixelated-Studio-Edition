import { Activity } from "lucide-react";
import type { WebRTCTelemetry } from "../../lib/webrtcTelemetry";

type StreamTelemetryPanelProps = {
  telemetry: WebRTCTelemetry;
};

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "--" : value.toFixed(digits);

export function StreamTelemetryPanel({ telemetry }: StreamTelemetryPanelProps) {
  return (
    <div className="w-full max-w-5xl mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
      <div className="min-h-16 rounded-lg border border-synth-border bg-synth-surface/80 px-3 py-2">
        <div className="flex items-center gap-2 text-xs uppercase text-gray-500">
          <Activity className="w-3.5 h-3.5" />
          FPS
        </div>
        <div className="mt-1 text-lg font-bold text-white tabular-nums">
          {formatNumber(telemetry.fps)}
        </div>
      </div>
      <div className="min-h-16 rounded-lg border border-synth-border bg-synth-surface/80 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Bitrate</div>
        <div className="mt-1 text-lg font-bold text-white tabular-nums">
          {formatNumber(telemetry.bitrateKbps)}{" "}
          <span className="text-xs font-medium text-gray-500">kbps</span>
        </div>
      </div>
      <div className="min-h-16 rounded-lg border border-synth-border bg-synth-surface/80 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">ICE</div>
        <div className="mt-1 text-lg font-bold text-white capitalize">
          {telemetry.iceConnectionState}
        </div>
      </div>
      <div className="min-h-16 rounded-lg border border-synth-border bg-synth-surface/80 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Loss / Jitter</div>
        <div className="mt-1 text-lg font-bold text-white tabular-nums">
          {telemetry.packetsLost}{" "}
          <span className="text-xs font-medium text-gray-500">
            / {formatNumber(telemetry.jitterMs, 1)} ms
          </span>
        </div>
      </div>
    </div>
  );
}
