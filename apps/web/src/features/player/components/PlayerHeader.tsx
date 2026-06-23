import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PixelIcon } from "../../../components/ui/PixelIcon";
import type { WebRTCStatus } from "../../../lib/webrtc/webrtcSession";

type PlayerHeaderProps = {
  backRoute: string;
  backText: string;
  gameTitle: string;
  showStreamTelemetry: boolean;
  status: WebRTCStatus;
  onToggleTelemetry: () => void;
  hideGameChrome?: boolean;
};

export function PlayerHeader({
  backRoute,
  backText,
  gameTitle,
  hideGameChrome = false,
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
      ? "bg-[#9B0048]"
      : status === "error"
        ? "bg-red-500"
        : "bg-amber-400 animate-pulse";
  const statusBadge = (
    <div className="flex items-center gap-2 rounded-full border border-synth-border bg-synth-surface px-4 py-2">
      <div className={`h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
      <span className="text-sm font-medium uppercase tracking-wider text-gray-300">
        {statusLabel}
      </span>
    </div>
  );

  return (
    <div
      className={`flex w-full max-w-5xl flex-col ${
        hideGameChrome ? "mb-1" : "mb-6"
      }`}
    >
      <div
        className={`flex items-center gap-4 ${
          hideGameChrome ? "justify-between px-1 py-2" : "justify-start p-4"
        }`}
      >
        <Link
          to={backRoute}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          {backText}
        </Link>
        {hideGameChrome && statusBadge}
      </div>

      {!hideGameChrome && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
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
            <PixelIcon className="h-4 w-4" name="logs" />
          </button>
          {statusBadge}
        </div>
      </div>
      )}
    </div>
  );
}
