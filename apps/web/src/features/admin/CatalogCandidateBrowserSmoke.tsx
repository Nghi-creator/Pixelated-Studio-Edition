import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FlaskConical, Loader2, XCircle } from "lucide-react";
import { api } from "../../lib/api/apiClient";
import type { ApiCatalogCandidate } from "../../lib/api/apiTypes";
import { getAdminApiErrorMessage } from "./adminState";
import {
  getNextBrowserSmokePollDelay,
  hasNewTerminalBrowserSmokeResult,
  type BrowserSmokePollResult,
} from "./browserSmokePolling";

type Props = {
  candidate: ApiCatalogCandidate;
  onRecorded: () => Promise<BrowserSmokePollResult | null>;
};

const POLL_DURATION_MS = 5 * 60 * 1000;
const INITIAL_POLL_DELAY_MS = 2_500;

const USER_EDITION_ORIGIN = (
  import.meta.env.VITE_USER_EDITION_ORIGIN ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5174"
    : "https://pixelated-user-edition.vercel.app")
).replace(/\/$/, "");

export function CatalogCandidateBrowserSmoke({ candidate, onRecorded }: Props) {
  const [opening, setOpening] = useState(false);
  const [localError, setLocalError] = useState("");
  const pollTimeoutRef = useRef<number | null>(null);
  const pollGenerationRef = useRef(0);

  const cancelPolling = () => {
    pollGenerationRef.current += 1;
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  useEffect(() => () => cancelPolling(), []);

  const compatibility = candidate.browser_compatibility;
  const canRun =
    compatibility.eligible &&
    compatibility.coreId !== null &&
    compatibility.systemId !== null;

  const openSmokeRunner = async () => {
    if (!canRun || opening) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setLocalError("Allow pop-ups to open the User Edition smoke runner.");
      return;
    }
    popup.opener = null;
    setOpening(true);
    setLocalError("");
    try {
      const { ticket } = await api.createCatalogCandidateBrowserSmokeTicket(candidate.id);
      const runnerUrl = `${USER_EDITION_ORIGIN}/internal/browser-smoke#ticket=${encodeURIComponent(ticket)}`;
      popup.location.replace(runnerUrl);

      cancelPolling();
      const generation = pollGenerationRef.current;
      const deadline = Date.now() + POLL_DURATION_MS;
      const baselineTestedAt = candidate.browser_smoke_tested_at;
      const schedulePoll = (delayMs: number) => {
        pollTimeoutRef.current = window.setTimeout(async () => {
          pollTimeoutRef.current = null;
          const result = await onRecorded().catch(() => null);
          if (generation !== pollGenerationRef.current) return;
          if (hasNewTerminalBrowserSmokeResult(baselineTestedAt, result)) {
            cancelPolling();
            return;
          }
          if (Date.now() >= deadline) {
            cancelPolling();
            return;
          }
          schedulePoll(getNextBrowserSmokePollDelay(delayMs));
        }, delayMs);
      };
      schedulePoll(INITIAL_POLL_DELAY_MS);
    } catch (error) {
      popup.close();
      setLocalError(getAdminApiErrorMessage(error, "Could not open browser smoke test."));
    } finally {
      setOpening(false);
    }
  };

  const status = candidate.browser_smoke_status;
  const resultMessage = localError || candidate.browser_smoke_error;

  return (
    <section className="mt-4 rounded-lg border border-synth-secondary/40 bg-synth-bg/80 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase text-white">
            <FlaskConical className="h-4 w-4" /> User Edition browser test
          </h3>
          <p className="mt-1 text-sm font-medium text-gray-200">
            {canRun
              ? "Opens a short-lived, candidate-bound test session in User Edition."
              : compatibility.reason || "This candidate is not compatible with User Edition."}
          </p>
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-synth-secondary/60 bg-synth-secondary/15 px-4 text-sm font-bold text-white hover:bg-synth-secondary/25 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRun || opening}
          onClick={() => void openSmokeRunner()}
          type="button"
        >
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {opening ? "Opening…" : status === "not_tested" ? "Open test" : "Run again"}
        </button>
      </div>

      {status === "passed" && !localError && (
        <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> Passed with {candidate.browser_smoke_core_id}
        </p>
      )}
      {(status === "failed" || localError) && (
        <p className="mt-3 flex items-start gap-2 text-sm font-bold text-red-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{resultMessage || "The browser smoke test failed."}</span>
        </p>
      )}
    </section>
  );
}
