import { useState } from "react";
import { Activity, Clipboard } from "lucide-react";
import type { WebRTCTelemetry } from "../../lib/webrtcTelemetry";

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
};

const formatNumber = (value: number | null, digits = 0) =>
  value === null ? "--" : value.toFixed(digits);

function buildTelemetrySnapshot({
  gameId,
  playerMode,
  sessionId,
  shareUrl,
  status,
  telemetry,
}: StreamTelemetryPanelProps) {
  return {
    capturedAt: new Date().toISOString(),
    gameId: gameId || null,
    playerMode,
    sessionId,
    shareUrl,
    status,
    telemetry,
    userAgent: navigator.userAgent,
  };
}

export function StreamTelemetryPanel(props: StreamTelemetryPanelProps) {
  const { telemetry } = props;
  const [copyState, setCopyState] = useState<"copied" | "failed" | "idle">(
    "idle",
  );

  const copyTelemetry = async () => {
    const snapshot = buildTelemetrySnapshot(props);

    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <div className="w-full max-w-5xl mt-3">
      <div className="mb-2 flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-md border border-synth-border bg-synth-surface/80 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-synth-primary/70 hover:text-white"
          onClick={copyTelemetry}
          title="Copy stream telemetry JSON"
          type="button"
        >
          <Clipboard className="h-3.5 w-3.5" />
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy Stats"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
    </div>
  );
}
