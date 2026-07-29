import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api/apiClient";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  getEngineToken,
} from "../../lib/engine/engineAuth";
import { useEngineConnectionStatus } from "../../lib/engine/useEngineConnectionStatus";
import {
  clearEngineUrl,
  DEFAULT_ENGINE_URL,
  getEngineUrl,
} from "../../lib/engine/engineConfig";
import { getInviteCompanionUrl, isLikelyCompanionUrl } from "./inviteUtils";
import type { PairingState } from "./pairingTypes";
import {
  isNormalizedPairingUrlChanged,
  preparePairing,
} from "./pairingPreparation";
import { executePairing } from "./pairingTransaction";
import {
  getEngineUrlScope,
  getScopeLabel,
  parseEngineUrl,
} from "./pairingUtils";
import { useLanPreflight } from "./useLanPreflight";

type UseEnginePairingOptions = {
  onPaired?: () => void;
};

export function useEnginePairing({ onPaired }: UseEnginePairingOptions = {}) {
  const connectionStatus = useEngineConnectionStatus();
  const [engineUrl, setEngineUrlInput] = useState(
    () => getInviteCompanionUrl(window.location.search) || getEngineUrl(),
  );
  const [inviteJoinRequested, setInviteJoinRequested] = useState(() =>
    Boolean(getInviteCompanionUrl(window.location.search)),
  );
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState(getEngineToken);
  const [pairingAttemptState, setPairingAttemptState] = useState<
    "idle" | "checking" | "error"
  >("idle");
  const [showToken, setShowToken] = useState(false);
  const [attemptMessage, setAttemptMessage] = useState("");

  const engineUrlScope = getEngineUrlScope(engineUrl);
  const parsedEngineUrl = parseEngineUrl(engineUrl);
  const isCompanionJoin = Boolean(
    inviteJoinRequested &&
      parsedEngineUrl &&
      isLikelyCompanionUrl(parsedEngineUrl),
  );
  const { lanPreflight, resetLanPreflight, retryLanPreflight } =
    useLanPreflight(engineUrl, isCompanionJoin);
  const preflightReady =
    lanPreflight.status === "complete" && lanPreflight.payload.ready === true;
  const hasSavedCredential = Boolean(getEngineToken());
  const savedScopeLabel = getScopeLabel(getEngineUrlScope(getEngineUrl()));
  const pairingState: PairingState =
    pairingAttemptState !== "idle"
      ? pairingAttemptState
      : connectionStatus === "online"
        ? "paired"
        : connectionStatus === "checking" && hasSavedCredential
          ? "checking"
          : connectionStatus === "offline" && hasSavedCredential
            ? "offline"
            : "idle";
  const connectionMessage =
    connectionStatus === "online"
      ? attemptMessage || `${savedScopeLabel} engine is connected.`
      : connectionStatus === "checking" && hasSavedCredential
        ? `Checking the saved ${savedScopeLabel.toLowerCase()} connection…`
        : connectionStatus === "offline" && hasSavedCredential
          ? `${savedScopeLabel} token is saved, but the desktop engine is offline or unreachable.`
          : connectionStatus === "rejected"
            ? "The saved engine credential expired or was rejected. Pair again from the desktop app."
            : "";
  const message =
    pairingAttemptState === "idle" ? connectionMessage : attemptMessage;

  useEffect(() => {
    const refreshPairingFields = () => {
      const currentToken = getEngineToken();
      const currentUrl = getEngineUrl();
      setToken(currentToken);
      setEngineUrlInput(currentUrl);
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshPairingFields);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshPairingFields);
  }, []);

  useEffect(() => {
    const currentUrl = parseEngineUrl(getEngineUrl());
    if (currentUrl && isLikelyCompanionUrl(currentUrl)) return;

    api
      .localPairing()
      .then(({ pairing }) => {
        setEngineUrlInput(pairing.engineUrl);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && [401, 404, 503].includes(err.status))) {
          console.warn("Failed to load backend local pairing:", err);
        }
      });
  }, []);

  const updateEngineUrl = (nextUrl: string) => {
    setEngineUrlInput(nextUrl);
    setInviteJoinRequested(false);
    resetLanPreflight(nextUrl, false);
  };

  const updateInviteCode = (nextInviteCode: string) => {
    setInviteCode(nextInviteCode.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  };

  const pairEngine = async () => {
    const preparation = preparePairing({
      engineUrl,
      inviteCode,
      inviteJoinRequested,
      preflightReady,
      token,
    });
    const normalizedUrl = preparation.ok
      ? preparation.attempt.normalizedUrl
      : preparation.normalizedUrl;
    if (isNormalizedPairingUrlChanged(engineUrl, normalizedUrl)) {
      setEngineUrlInput(normalizedUrl);
    }
    if (!preparation.ok) {
      setPairingAttemptState("error");
      setAttemptMessage(preparation.message);
      return;
    }

    setPairingAttemptState("checking");
    setAttemptMessage(preparation.attempt.checkingMessage);
    const result = await executePairing(preparation.attempt);
    if (!result.ok) {
      setPairingAttemptState("error");
      setAttemptMessage(result.message);
      if (result.retryPreflight) void retryLanPreflight();
      return;
    }

    setToken(result.normalizedToken);
    setPairingAttemptState("idle");
    setInviteJoinRequested(false);
    setAttemptMessage(result.message);
    onPaired?.();
  };

  const disconnect = async () => {
    clearEngineToken();
    clearEngineUrl();
    setToken("");
    setEngineUrlInput(DEFAULT_ENGINE_URL);
    setPairingAttemptState("idle");
    setAttemptMessage("");
    resetLanPreflight(DEFAULT_ENGINE_URL, false);

    try {
      await api.clearLocalPairing();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.warn("Failed to clear backend local pairing:", err);
      }
    }
  };

  return {
    disconnect,
    engineUrl,
    engineUrlScope,
    hasSavedCredential,
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
  };
}
