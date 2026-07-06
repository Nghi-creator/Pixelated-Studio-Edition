import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Gamepad2,
  Network,
  Upload,
} from "lucide-react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { EnginePairingPanel } from "../../features/local-engine/EnginePairingPanel";
import { ENGINE_PAIRING_EVENT, hasEngineToken } from "../../lib/engine/engineAuth";
import { PixelIcon } from "../../components/ui/PixelIcon";

type EngineLocationState = {
  returnState?: unknown;
};

const pairedActionLinks = [
  {
    description: "Browse and launch games from the public library.",
    icon: Gamepad2,
    label: "Play games",
    to: "/home",
  },
  {
    description: "Upload and play games from this computer.",
    icon: Upload,
    label: "Access Local Vault",
    to: "/local",
  },
  {
    description: "Start a LAN lobby for nearby players.",
    icon: Network,
    label: "Host games on LAN",
    to: "/multiplayer",
  },
];

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/home";
  if (value.startsWith("/engine")) return "/home";
  return value;
}

export default function EngineConnection() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const locationState =
    typeof location.state === "object" && location.state !== null
      ? (location.state as EngineLocationState)
      : null;
  const isReturning = returnTo !== "/home";
  const [isPaired, setIsPaired] = useState(hasEngineToken);
  const [showPairedActions, setShowPairedActions] = useState(false);
  const shouldShowPairedActions = isPaired && showPairedActions;

  useEffect(() => {
    const refreshEnginePairing = () => setIsPaired(hasEngineToken());
    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

  const continueToDestination = () => {
    navigate(returnTo, {
      replace: true,
      state: locationState?.returnState,
    });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          className="group inline-flex items-center gap-2 font-medium text-gray-400 transition-colors hover:text-white"
          to="/home"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">
          Engine Connection
        </h1>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          "Open the desktop app or host join link",
          "Confirm the desktop engine is running",
          "Pair locally or join with an invite code",
        ].map((step, index) => (
          <div
            className="flex items-center gap-3 rounded-lg border border-[#6A2941] bg-[#2B1720] px-4 py-3"
            key={step}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#D03A79] bg-[#A6004B] text-xs font-bold text-white">
              {index + 1}
            </span>
            <span className="text-sm font-semibold text-white">{step}</span>
          </div>
        ))}
      </div>

      {isPaired && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-[#C02066]/40 bg-[#9B0048]/15 px-4 py-3 text-sm text-[#F38BB4] sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            This browser has a saved engine connection.
          </span>
          {isReturning && (
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#C02066]/50 bg-[#9B0048]/20 px-4 font-bold text-white transition-colors hover:bg-[#9B0048]/30"
              onClick={continueToDestination}
              type="button"
            >
              <PixelIcon className="h-4 w-4" name="engine-on" />
              Continue
            </button>
          )}
        </div>
      )}

      <EnginePairingPanel
        onPaired={() => {
          setIsPaired(true);
          if (isReturning) {
            continueToDestination();
            return;
          }
          setShowPairedActions(true);
        }}
      />

      {shouldShowPairedActions && (
        <section className="mt-6 rounded-lg border border-[#6A2941] bg-[#2B1720] p-5">
          <div className="mb-4 flex items-center gap-2 text-[#F38BB4]">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-base font-bold text-white">You can now:</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {pairedActionLinks.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  className="group flex min-h-28 flex-col justify-between rounded-lg border border-[#7E3250] bg-synth-bg p-4 transition-colors hover:border-[#C02066] hover:bg-[#3A1C29]"
                  key={action.to}
                  to={action.to}
                >
                  <span className="flex items-center gap-3 text-sm font-bold text-white">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#C02066]/50 bg-[#9B0048]/20 text-[#F38BB4] transition-colors group-hover:bg-[#9B0048]/35">
                      <Icon className="h-4 w-4" />
                    </span>
                    {action.label}
                  </span>
                  <span className="mt-3 text-sm leading-5 text-gray-400">
                    {action.description}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
