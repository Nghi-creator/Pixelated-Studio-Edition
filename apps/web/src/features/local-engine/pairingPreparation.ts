import { isLikelyCompanionUrl } from "./inviteUtils.ts";
import {
  getEngineUrlScope,
  getScopeLabel,
  normalizeEngineUrl,
  normalizePairingEngineUrl,
  parseEngineUrl,
} from "./pairingUtils.ts";

export type PreparedPairing = {
  checkingMessage: string;
  joiningWithInvite: boolean;
  normalizedInviteCode: string;
  normalizedToken: string;
  normalizedUrl: string;
  parsedUrl: URL;
};

export type PairingPreparation =
  | { message: string; ok: false; normalizedUrl: string }
  | { attempt: PreparedPairing; ok: true };

export function preparePairing({
  engineUrl,
  inviteCode,
  inviteJoinRequested,
  preflightReady,
  token,
}: {
  engineUrl: string;
  inviteCode: string;
  inviteJoinRequested: boolean;
  preflightReady: boolean;
  token: string;
}): PairingPreparation {
  const normalizedUrl = normalizePairingEngineUrl(engineUrl);
  const parsedUrl = parseEngineUrl(normalizedUrl);
  const joiningWithInvite = Boolean(
    inviteJoinRequested && parsedUrl && isLikelyCompanionUrl(parsedUrl),
  );
  const normalizedInviteCode = inviteCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const normalizedToken = token.trim();

  if (!normalizedUrl || (!joiningWithInvite && !normalizedToken)) {
    return {
      message: "Enter the engine URL and desktop pairing token.",
      normalizedUrl,
      ok: false,
    };
  }
  if (joiningWithInvite && !normalizedInviteCode) {
    return {
      message: "Enter the invite code from the host desktop app.",
      normalizedUrl,
      ok: false,
    };
  }
  if (joiningWithInvite && !preflightReady) {
    return {
      message: "Complete the LAN join checks before entering the invite code.",
      normalizedUrl,
      ok: false,
    };
  }
  if (!parsedUrl) {
    return {
      message: "Enter a valid engine URL, including http:// or https://.",
      normalizedUrl,
      ok: false,
    };
  }

  return {
    attempt: {
      checkingMessage: joiningWithInvite
        ? "Checking invite code..."
        : `Checking ${getScopeLabel(getEngineUrlScope(normalizedUrl)).toLowerCase()}...`,
      joiningWithInvite,
      normalizedInviteCode,
      normalizedToken,
      normalizedUrl,
      parsedUrl,
    },
    ok: true,
  };
}

export function isNormalizedPairingUrlChanged(
  engineUrl: string,
  normalizedUrl: string,
) {
  return normalizedUrl !== normalizeEngineUrl(engineUrl);
}
