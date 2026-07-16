import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api/apiClient";
import {
  clearEngineToken,
  ENGINE_PAIRING_EVENT,
  getEngineToken,
} from "../../lib/engine/engineAuth";
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
  const [engineUrl, setEngineUrlInput] = useState(
    () => getInviteCompanionUrl(window.location.search) || getEngineUrl(),
  );
  const [inviteJoinRequested, setInviteJoinRequested] = useState(() =>
    Boolean(getInviteCompanionUrl(window.location.search)),
  );
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState(getEngineToken);
  const [pairingState, setPairingState] = useState<PairingState>(
    token ? "paired" : "idle",
  );
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState(
    token
      ? `${getScopeLabel(getEngineUrlScope(getEngineUrl()))} token is saved in this browser.`
      : "",
  );

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

  useEffect(() => {
    const refreshPairingState = () => {
      const currentToken = getEngineToken();
      const currentUrl = getEngineUrl();
      setToken(currentToken);
      setEngineUrlInput(currentUrl);
      setPairingState(currentToken ? "paired" : "idle");
      setMessage(
        currentToken
          ? `${getScopeLabel(getEngineUrlScope(currentUrl))} token is saved in this browser.`
          : "",
      );
    };

    window.addEventListener(ENGINE_PAIRING_EVENT, refreshPairingState);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshPairingState);
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
      setPairingState("error");
      setMessage(preparation.message);
      return;
    }

    setPairingState("checking");
    setMessage(preparation.attempt.checkingMessage);
    const result = await executePairing(preparation.attempt);
    if (!result.ok) {
      setPairingState("error");
      setMessage(result.message);
      if (result.retryPreflight) void retryLanPreflight();
      return;
    }

    setToken(result.normalizedToken);
    setPairingState("paired");
    setInviteJoinRequested(false);
    setMessage(result.message);
    onPaired?.();
  };

  const disconnect = async () => {
    clearEngineToken();
    clearEngineUrl();
    setToken("");
    setEngineUrlInput(DEFAULT_ENGINE_URL);
    setPairingState("idle");
    setMessage("");
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
