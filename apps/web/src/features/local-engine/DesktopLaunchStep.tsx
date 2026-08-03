import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import {
  DESKTOP_LAUNCH_HELP_DELAY_MS,
  DESKTOP_OPEN_URL,
  DESKTOP_RELEASES_URL,
} from "./desktopAppLaunch";

type DesktopLaunchState = "idle" | "opening" | "requested" | "help";

type DesktopLaunchStepProps = {
  isHostJoin: boolean;
};

export function DesktopLaunchStep({ isHostJoin }: DesktopLaunchStepProps) {
  const [launchState, setLaunchState] = useState<DesktopLaunchState>("idle");
  const launchAttemptedRef = useRef(false);
  const helpTimeoutRef = useRef<number | null>(null);

  const clearHelpTimeout = () => {
    if (helpTimeoutRef.current === null) return;
    window.clearTimeout(helpTimeoutRef.current);
    helpTimeoutRef.current = null;
  };

  useEffect(() => {
    const clearPendingHelp = () => {
      if (helpTimeoutRef.current === null) return;
      window.clearTimeout(helpTimeoutRef.current);
      helpTimeoutRef.current = null;
    };
    const handleVisibilityChange = () => {
      if (!launchAttemptedRef.current || document.visibilityState !== "hidden") {
        return;
      }
      clearPendingHelp();
      // Becoming hidden is a useful hint that the OS switched applications,
      // but browsers do not let the site treat it as proof of a successful open.
      setLaunchState("requested");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearPendingHelp();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleLaunch = () => {
    clearHelpTimeout();
    launchAttemptedRef.current = true;
    setLaunchState("opening");
    helpTimeoutRef.current = window.setTimeout(() => {
      helpTimeoutRef.current = null;
      setLaunchState("help");
    }, DESKTOP_LAUNCH_HELP_DELAY_MS);
  };

  if (isHostJoin) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[#6A2941] bg-[#2B1720] px-4 py-3">
        <StepNumber />
        <span className="text-sm font-semibold text-white">
          Open the desktop app or host join link
        </span>
      </div>
    );
  }

  return (
    <div>
      <a
        aria-describedby={launchState === "idle" ? undefined : "desktop-launch-status"}
        className="group flex items-center gap-3 rounded-lg border border-[#8A3154] bg-[#321923] px-4 py-3 transition-colors hover:border-[#D03A79] hover:bg-[#3A1C29] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F38BB4] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        href={DESKTOP_OPEN_URL}
        onClick={handleLaunch}
      >
        <StepNumber />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white underline decoration-[#D03A79]/70 decoration-2 underline-offset-4 group-hover:decoration-[#F38BB4]">
            Open Pixelated Desktop
          </span>
          <span className="mt-1 block text-xs font-medium text-gray-400">
            {launchState === "opening"
              ? "Waiting for your browser or device…"
              : launchState === "requested"
                ? "Launch requested—continue in Desktop"
                : launchState === "help"
                  ? "Didn't open? See the options below"
                  : "Launch the installed desktop app"}
          </span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-[#F38BB4] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </a>

      {launchState !== "idle" && (
        <div
          aria-live="polite"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
            launchState === "help"
              ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
              : "border-[#6A2941] bg-[#1C1116] text-gray-300"
          }`}
          id="desktop-launch-status"
        >
          {launchState === "help" ? (
            <>
              <p>
                We couldn't confirm that Desktop opened. Your browser may have
                blocked the request, or the app may be missing, moved, or too old
                to support this link.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-semibold">
                <a
                  className="text-white underline underline-offset-2 hover:text-[#F38BB4]"
                  href={DESKTOP_OPEN_URL}
                  onClick={handleLaunch}
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
                <span className="font-normal text-gray-400">
                  Or open it manually from Applications or the Start menu.
                </span>
              </div>
            </>
          ) : launchState === "requested" ? (
            "Continue in Pixelated Desktop, start the engine, then choose Launch Web. If the app did not open, use this link again."
          ) : (
            "Your browser may ask for permission to open Pixelated Desktop. We cannot detect whether you dismiss that prompt."
          )}
        </div>
      )}
    </div>
  );
}

function StepNumber() {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#D03A79] bg-[#A6004B] text-xs font-bold text-white">
      1
    </span>
  );
}
