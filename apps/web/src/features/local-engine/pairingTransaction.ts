import { api, ApiError } from "../../lib/api/apiClient";
import {
  createCompanionEngineToken,
  getCompanionAccessToken,
  setEngineToken,
} from "../../lib/engine/engineAuth";
import { setEngineUrl } from "../../lib/engine/engineConfig";
import { engineFetch } from "../../lib/engine/engineRequest";
import { getInviteFailureMessage } from "./inviteUtils";
import type { PreparedPairing } from "./pairingPreparation";
import type {
  EngineHealthPayload,
  InviteRedeemPayload,
} from "./pairingTypes";
import {
  engineUrlEndpoint,
  getEngineUrlScope,
  getPairingFailureMessage,
} from "./pairingUtils";

export type PairingExecutionResult =
  | { message: string; ok: false; retryPreflight: boolean }
  | { message: string; normalizedToken: string; ok: true };

export async function executePairing(
  attempt: PreparedPairing,
): Promise<PairingExecutionResult> {
  let normalizedToken = attempt.normalizedToken;

  try {
    if (attempt.joiningWithInvite) {
      const inviteResponse = await engineFetch(
        engineUrlEndpoint(attempt.normalizedUrl, "/invite/redeem"),
        {
          body: JSON.stringify({ code: attempt.normalizedInviteCode }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!inviteResponse.ok) {
        const payload = (await inviteResponse
          .json()
          .catch(() => ({}))) as InviteRedeemPayload;
        return {
          message: getInviteFailureMessage(inviteResponse.status, payload.code),
          ok: false,
          retryPreflight: [410, 503].includes(inviteResponse.status),
        };
      }

      const payload = (await inviteResponse.json()) as InviteRedeemPayload;
      if (!payload.companionToken) {
        return {
          message: "The host join page did not return a companion credential.",
          ok: false,
          retryPreflight: false,
        };
      }
      normalizedToken = createCompanionEngineToken(payload.companionToken);
    }

    const healthResponse = await engineFetch(
      engineUrlEndpoint(attempt.normalizedUrl, "/health"),
    );
    if (!healthResponse.ok) {
      return {
        message: getPairingFailureMessage({
          error: new Error("Engine health check failed."),
          parsedUrl: attempt.parsedUrl,
          scope: getEngineUrlScope(attempt.normalizedUrl),
          status: healthResponse.status,
        }),
        ok: false,
        retryPreflight: false,
      };
    }

    const health = (await healthResponse.json()) as EngineHealthPayload;
    const actualScope = getEngineUrlScope(attempt.normalizedUrl);
    if (actualScope === "lan" && (health.exposureMode || "local") !== "lan") {
      return {
        message:
          "That URL looks like a LAN address, but the engine reports local-only mode. Enable LAN mode in the desktop app and restart the engine.",
        ok: false,
        retryPreflight: false,
      };
    }

    const authResponse = await engineFetch(
      engineUrlEndpoint(attempt.normalizedUrl, "/local-games"),
      {
        headers: {
          "X-Engine-Token":
            getCompanionAccessToken(normalizedToken) || normalizedToken,
          "X-User-Id": "pairing-check",
        },
      },
    );
    if (!authResponse.ok) {
      return {
        message: getPairingFailureMessage({
          error: new Error("Engine token check failed."),
          parsedUrl: attempt.parsedUrl,
          scope: actualScope,
          status: authResponse.status,
        }),
        ok: false,
        retryPreflight: false,
      };
    }

    setEngineUrl(attempt.normalizedUrl);
    setEngineToken(normalizedToken);
    let message = attempt.joiningWithInvite
      ? "Joined the host engine. Keep this page open while you play."
      : actualScope === "lan"
        ? "LAN engine paired. Keep the desktop app running while guests connect."
        : "Local engine paired.";

    try {
      await api.pairLocalEngine(attempt.normalizedUrl);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        message = attempt.joiningWithInvite
          ? "Joined the host engine. Sign in to register pairing intent with the API."
          : "Engine token saved locally. Sign in to register pairing intent with the API.";
      } else {
        console.warn("Local engine paired, but API registration failed:", err);
        message = attempt.joiningWithInvite
          ? "Joined the host engine. Backend pairing registration is unavailable."
          : "Engine token saved locally. Backend pairing registration is unavailable.";
      }
    }

    return { message, normalizedToken, ok: true };
  } catch (error) {
    console.error("Failed to pair local engine:", error);
    return {
      message: getPairingFailureMessage({
        error,
        parsedUrl: attempt.parsedUrl,
        scope: getEngineUrlScope(attempt.normalizedUrl),
      }),
      ok: false,
      retryPreflight: false,
    };
  }
}
