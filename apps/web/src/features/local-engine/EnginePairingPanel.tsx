import { Eye, EyeOff, Loader2, Trash2, Wifi } from "lucide-react";
import { getScopeDescription, getScopeLabel } from "./pairingUtils";
import { LanPreflightChecks } from "./LanPreflightChecks";
import { PixelIcon } from "../../components/ui/PixelIcon";
import { useEnginePairing } from "./useEnginePairing";

type EnginePairingPanelProps = {
  compact?: boolean;
  onPaired?: () => void;
};

export function EnginePairingPanel({
  compact = false,
  onPaired,
}: EnginePairingPanelProps) {
  const {
    disconnect,
    engineUrl,
    engineUrlScope,
    inviteCode,
    isCompanionJoin,
    lanPreflight,
    message,
    pairEngine,
    pairingState,
    preflightReady,
    retryLanPreflight,
    setShowToken,
    setToken,
    showToken,
    token,
    updateEngineUrl,
    updateInviteCode,
  } = useEnginePairing({ onPaired });

  return (
    <section
      className={`w-full border border-[#6A2941] bg-[#2B1720] ${
        compact ? "rounded-lg p-4" : "rounded-lg p-5"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            {pairingState === "paired" ? (
              <PixelIcon className="h-5 w-5 text-[#C02066]" name="engine-on" />
            ) : engineUrlScope === "lan" ? (
              <Wifi className="h-5 w-5 text-amber-400" />
            ) : (
              <PixelIcon className="h-5 w-5 text-amber-400" name="engine-off" />
            )}
            <h3 className="text-base font-semibold text-white">
              {isCompanionJoin ? "Join Host Engine" : "Local Engine Pairing"}
            </h3>
          </div>

          <div
            className={`grid gap-3 ${
              isCompanionJoin
                ? "md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]"
                : "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
            }`}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                Engine URL
              </span>
              <input
                value={engineUrl}
                onChange={(event) => updateEngineUrl(event.target.value)}
                className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
                placeholder="http://localhost:8080 or http://192.168.1.20:8080"
              />
            </label>

            {isCompanionJoin ? (
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                  Invite code
                </span>
                <input
                  value={inviteCode}
                  onChange={(event) => updateInviteCode(event.target.value)}
                  className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 font-mono text-sm tracking-widest text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
                  maxLength={8}
                  placeholder="A1B2C3D4"
                />
              </label>
            ) : (
              <label className="relative block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#F38BB4]">
                  Pairing token
                </span>
                <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void pairEngine();
                }}
                className="h-11 w-full rounded-lg border border-[#7E3250] bg-synth-bg px-3 pr-11 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#C01662]"
                placeholder="Desktop app token"
                type={showToken ? "text" : "password"}
              />
                <button
                  aria-label={
                    showToken ? "Hide pairing token" : "Show pairing token"
                  }
                  className="absolute right-2 top-7 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:text-white"
                  onClick={() => setShowToken((isVisible) => !isVisible)}
                  title={showToken ? "Hide token" : "Show token"}
                  type="button"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </label>
            )}
          </div>

          {(isCompanionJoin || engineUrlScope !== "local") && (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-5 ${
                engineUrlScope === "lan"
                  ? "border-synth-primary/30 bg-synth-bg text-synth-secondary"
                  : "border-synth-border bg-synth-bg text-gray-400"
              }`}
            >
              <span className="font-semibold text-white">
                {isCompanionJoin
                  ? "HTTPS join page"
                  : getScopeLabel(engineUrlScope)}
                :
              </span>{" "}
              {isCompanionJoin
                ? "Enter the short-lived invite code from the host desktop app. The raw engine token stays on the host."
                : getScopeDescription(engineUrlScope)}
            </div>
          )}

          {isCompanionJoin && (
            <LanPreflightChecks
              engineUrl={engineUrl}
              preflight={lanPreflight}
              retry={() => void retryLanPreflight()}
            />
          )}

          {message && (
            <p
              className={`mt-3 text-sm ${
                pairingState === "error"
                  ? "danger-panel rounded-lg border px-3 py-2 font-bold"
                  : "text-gray-300"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-nowrap gap-2 md:self-start md:pt-14">
          <button
            onClick={pairEngine}
            disabled={
              pairingState === "checking" ||
              (isCompanionJoin && pairingState !== "paired" && !preflightReady)
            }
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-[#C02066] bg-[#9B0048] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B00052] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            {pairingState === "checking" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isCompanionJoin
              ? pairingState === "paired"
                ? "Update"
                : "Join"
              : pairingState === "paired"
                ? "Update"
                : "Pair"}
          </button>

          {pairingState === "paired" && (
            <button
              onClick={disconnect}
              className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-synth-border bg-synth-bg px-3 text-sm font-semibold text-gray-300 transition-colors hover:border-red-400/70 hover:text-red-300"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
