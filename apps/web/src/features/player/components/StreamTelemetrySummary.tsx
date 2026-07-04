import type { WebRTCTelemetry } from "../../../lib/webrtc/webrtcTelemetry";
import type { StreamTelemetryHistorySample } from "../hooks/useStreamTelemetryHistory";

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "--" : value.toFixed(digits);

export function StreamTelemetrySummary({
  displayedPacketsLost,
  latestHistorySample,
  telemetry,
}: {
  displayedPacketsLost: number;
  latestHistorySample: StreamTelemetryHistorySample | undefined;
  telemetry: WebRTCTelemetry;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 xl:gap-3">
      <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
        <div className="text-[11px] font-semibold uppercase text-gray-500">
          FPS
        </div>
        <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
          {formatNumber(latestHistorySample?.fps ?? null)}
        </div>
      </div>
      <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
        <div className="text-[11px] font-semibold uppercase text-gray-500">
          Bitrate
        </div>
        <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
          {formatNumber(latestHistorySample?.bitrateKbps ?? null)}{" "}
          <span className="text-[10px] font-medium text-gray-500">kbps</span>
        </div>
      </div>
      <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
        <div className="text-[11px] font-semibold uppercase text-gray-500">
          ICE
        </div>
        <div className="mt-1 truncate text-sm font-bold capitalize text-white xl:mt-0 xl:max-w-36">
          {telemetry.iceConnectionState}
        </div>
      </div>
      <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
        <div className="text-[11px] font-semibold uppercase text-gray-500">
          Loss / Jitter
        </div>
        <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
          {latestHistorySample?.packetsLost ?? displayedPacketsLost}{" "}
          <span className="text-[10px] font-medium text-gray-500">
            / {formatNumber(latestHistorySample?.jitterMs ?? null, 1)} ms
          </span>
        </div>
      </div>
    </div>
  );
}
