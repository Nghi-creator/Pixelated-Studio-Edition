import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FlaskConical, Loader2, XCircle } from "lucide-react";
import { api } from "../../lib/api/apiClient";
import type { ApiCatalogCandidate } from "../../lib/api/apiTypes";
import { getAdminApiErrorMessage } from "./adminState";

type Props = {
  candidate: ApiCatalogCandidate;
  onRecorded: () => void;
};

const USER_EDITION_ORIGIN = (
  import.meta.env.VITE_USER_EDITION_ORIGIN ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5174"
    : "https://pixelated-user-edition.vercel.app")
).replace(/\/$/, "");

export function CatalogCandidateBrowserSmoke({ candidate, onRecorded }: Props) {
  const [opening, setOpening] = useState(false);
  const [localError, setLocalError] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  const compatibility = candidate.browser_compatibility;
  const canRun =
    compatibility.eligible &&
    compatibility.coreId === "fceumm" &&
    compatibility.systemId === "nes";

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

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(onRecorded, 2_500);
      window.setTimeout(() => {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }, 5 * 60 * 1000);
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
