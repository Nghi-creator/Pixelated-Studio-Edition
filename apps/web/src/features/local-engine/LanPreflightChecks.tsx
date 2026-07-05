import {
  AlertTriangle,
  RefreshCw,
  Server,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import type { ReactNode } from "react";
import type { LanPreflightState } from "./pairingTypes";
import { normalizeEngineUrl } from "./pairingUtils";

function PreflightRow({
  icon,
  label,
  message,
  tone,
}: {
  icon: ReactNode;
  label: string;
  message: string;
  tone: "checking" | "fail" | "pass" | "waiting";
}) {
  const toneClass =
    tone === "pass"
      ? "text-[#F38BB4]"
      : tone === "fail"
        ? "font-semibold text-red-100"
        : tone === "checking"
          ? "text-synth-secondary"
          : "text-gray-400";

  return (
    <li className={`flex items-start gap-2 ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <strong className="text-white">{label}:</strong> {message}
      </span>
    </li>
  );
}

export function LanPreflightChecks({
  engineUrl,
  preflight,
  retry,
}: {
  engineUrl: string;
  preflight: LanPreflightState;
  retry: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-synth-border bg-synth-bg px-3 py-3 text-xs leading-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold uppercase tracking-wide text-gray-300">
          LAN join checks
        </span>
        <button
          className="inline-flex items-center gap-1 font-semibold text-synth-secondary transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={preflight.status === "checking"}
          onClick={retry}
          type="button"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              preflight.status === "checking" ? "animate-spin" : ""
            }`}
          />
          Check again
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        <PreflightRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Certificate"
          message={
            preflight.status === "unreachable"
              ? "Trust required. Open this HTTPS join URL directly and accept the browser warning."
              : preflight.status === "complete"
                ? "Accepted for this join page."
                : "Checking HTTPS trust..."
          }
          tone={
            preflight.status === "unreachable"
              ? "fail"
              : preflight.status === "complete"
                ? "pass"
                : "checking"
          }
        />
        <PreflightRow
          icon={<Ticket className="h-4 w-4" />}
          label="Invite"
          message={
            preflight.status === "complete"
              ? preflight.payload.invite?.status === "active"
                ? `Active${
                    preflight.payload.invite.expiresAt
                      ? ` until ${new Date(
                          preflight.payload.invite.expiresAt,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""
                  }.`
                : preflight.payload.invite?.status === "expired"
                  ? "Expired. Ask the host to regenerate the code."
                  : "Revoked. Ask the host to regenerate the code."
              : "Waiting for the HTTPS join page."
          }
          tone={
            preflight.status !== "complete"
              ? "waiting"
              : preflight.payload.invite?.status === "active"
                ? "pass"
                : "fail"
          }
        />
        <PreflightRow
          icon={
            preflight.status === "complete" &&
            preflight.payload.engine?.status === "unavailable" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Server className="h-4 w-4" />
            )
          }
          label="Host engine"
          message={
            preflight.status === "complete"
              ? preflight.payload.engine?.status === "available"
                ? "Available."
                : "Unavailable. Ask the host to initialize or restart it."
              : "Waiting for the HTTPS join page."
          }
          tone={
            preflight.status !== "complete"
              ? "waiting"
              : preflight.payload.engine?.status === "available"
                ? "pass"
                : "fail"
          }
        />
      </ul>
      {preflight.status === "unreachable" && (
        <a
          className="mt-2 inline-flex font-semibold text-synth-secondary underline underline-offset-2 hover:text-white"
          href={normalizeEngineUrl(engineUrl)}
          rel="noreferrer"
          target="_blank"
        >
          Open HTTPS join page to trust certificate
        </a>
      )}
    </div>
  );
}
