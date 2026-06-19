import { Activity, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import type { WebRTCStatus } from "../../lib/webrtc/webrtcSession";

type PlayerHeaderProps = {
  backRoute: string;
  backText: string;
  gameTitle: string;
  showStreamTelemetry: boolean;
  status: WebRTCStatus;
  onToggleTelemetry: () => void;
};

export function PlayerHeader({
  backRoute,
  backText,
  gameTitle,
  onToggleTelemetry,
  showStreamTelemetry,
  status,
}: PlayerHeaderProps) {
  const statusLabel =
    status === "connecting"
      ? "Connecting to Edge Node..."
      : status === "playing"
        ? "Live Stream Active"
        : status === "error"
          ? "Stream Error"
          : "Idle";
  const statusDotClass =
    status === "playing"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-synth-secondary animate-pulse";

  return (
    <div className="w-full max-w-5xl flex flex-col mb-6">
      <div className="p-4">
        <Link
          to={backRoute}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          {backText}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          {gameTitle || "Loading Game..."}
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTelemetry}
            aria-pressed={showStreamTelemetry}
            aria-label="Toggle stream telemetry"
            title="Toggle stream telemetry"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
              showStreamTelemetry
                ? "border-synth-border bg-synth-elevated text-white"
                : "border-synth-border bg-synth-surface text-gray-400 hover:text-white"
            }`}
          >
            <Activity className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 bg-synth-surface px-4 py-2 rounded-full border border-synth-border">
            <div className={`w-2.5 h-2.5 rounded-full ${statusDotClass}`} />
            <span className="text-sm font-medium text-gray-300 uppercase tracking-wider">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
