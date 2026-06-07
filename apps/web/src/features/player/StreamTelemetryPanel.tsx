import { useState } from "react";
import { Activity, Clipboard, X } from "lucide-react";
import type { WebRTCTelemetry } from "../../lib/webrtcTelemetry";

type StreamTelemetryPanelProps = {
  gameId: string | undefined;
  playerMode: "guest" | "host";
  sessionId: string;
  shareUrl: string;
  status: string;
  telemetry: WebRTCTelemetry;
  onClose: () => void;
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
  const { onClose, telemetry } = props;
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
    <section className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-synth-border bg-synth-surface/95 p-3 shadow-glow-card backdrop-blur-xl sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-72 xl:right-5 xl:top-24">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Activity className="h-4 w-4 text-synth-primary" />
          Stream Stats
        </p>
        <div className="flex items-center gap-1">
          <button
            aria-label="Copy stream telemetry JSON"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-synth-border bg-synth-bg px-2 text-xs font-semibold text-gray-300 transition hover:border-synth-primary/70 hover:text-white"
            onClick={copyTelemetry}
            title="Copy stream telemetry JSON"
            type="button"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Failed"
                : null}
          </button>
          <button
            aria-label="Hide stream stats"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-synth-border bg-synth-bg text-gray-400 transition hover:border-synth-primary/70 hover:text-white"
            onClick={onClose}
            title="Hide stream stats"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            FPS
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(telemetry.fps)}
          </div>
        </div>
        <div className="rounded-md border border-synth-border bg-synth-bg/90 px-3 py-2 xl:flex xl:items-center xl:justify-between">
          <div className="text-[11px] font-semibold uppercase text-gray-500">
            Bitrate
          </div>
          <div className="mt-1 text-base font-bold text-white tabular-nums xl:mt-0">
            {formatNumber(telemetry.bitrateKbps)}{" "}
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
            {telemetry.packetsLost}{" "}
            <span className="text-[10px] font-medium text-gray-500">
              / {formatNumber(telemetry.jitterMs, 1)} ms
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
