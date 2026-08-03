import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
} from "lucide-react";
import {
  DESKTOP_OPEN_URL,
  DESKTOP_RELEASES_URL,
} from "./desktopAppLaunch";

type DesktopLaunchPanelProps = {
  isEngineConnected: boolean;
  isHostJoin: boolean;
};

export function DesktopLaunchPanel({
  isEngineConnected,
  isHostJoin,
}: DesktopLaunchPanelProps) {
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  if (isHostJoin) return null;

  return (
    <section className="mt-6 rounded-lg border border-[#6A2941] bg-[#2B1720] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isEngineConnected ? (
              <CheckCircle2 className="h-5 w-5 text-[#F38BB4]" />
            ) : (
              <ExternalLink className="h-5 w-5 text-[#E35D96]" />
            )}
            <h2 className="text-base font-semibold text-white">Desktop app</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            {isEngineConnected
              ? "The desktop engine is already connected, so you do not need to open the app again."
              : "Open the desktop engine if you haven't already."}
          </p>
        </div>

        {!isEngineConnected && (
          <a
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#C02066] bg-[#9B0048] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B00052] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F38BB4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2B1720]"
            href={DESKTOP_OPEN_URL}
          >
            <ExternalLink className="h-4 w-4" />
            Open Desktop
          </a>
        )}
      </div>

      {!isEngineConnected && (
        <div className="mt-3">
          <button
            aria-expanded={showTroubleshooting}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#E35D96] underline decoration-[#A6004B] underline-offset-4 transition-colors hover:text-[#F38BB4]"
            onClick={() => setShowTroubleshooting((isVisible) => !isVisible)}
            type="button"
          >
            Desktop didn't open?
            {showTroubleshooting ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {showTroubleshooting && (
            <div className="mt-3 rounded-lg border border-[#C02066]/50 bg-[#9B0048]/15 px-3 py-2 text-xs leading-5 text-[#F7B1CD]">
              <p>
                If you chose Open and nothing happened, try again or download
                the latest version.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-semibold">
                <a
                  className="text-white underline underline-offset-2 hover:text-[#F38BB4]"
                  href={DESKTOP_OPEN_URL}
                >
                  Try again
                </a>
                <a
                  className="inline-flex items-center gap-1 text-white underline underline-offset-2 hover:text-[#F38BB4]"
                  href={DESKTOP_RELEASES_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download or update
                </a>
                <span className="font-normal text-white">
                  Or open it manually from Applications or the Start menu.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
