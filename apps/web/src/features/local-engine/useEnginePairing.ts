import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api/apiClient";
import {
  clearEngineToken,
  createCompanionEngineToken,
  ENGINE_PAIRING_EVENT,
  getCompanionAccessToken,
  getEngineToken,
  setEngineToken,
} from "../../lib/engine/engineAuth";
import {
  clearEngineUrl,
  DEFAULT_ENGINE_URL,
  getEngineUrl,
  setEngineUrl,
} from "../../lib/engine/engineConfig";
import { engineFetch } from "../../lib/engine/engineRequest";
import {
  getInviteCompanionUrl,
  getInviteFailureMessage,
  isLikelyCompanionUrl,
} from "./inviteUtils";
import type {
  EngineHealthPayload,
  InviteRedeemPayload,
  LanPreflightState,
  PairingState,
} from "./pairingTypes";
import {
  engineUrlEndpoint,
  fetchLanPreflight,
  getEngineUrlScope,
  getPairingFailureMessage,
  getScopeLabel,
  normalizeEngineUrl,
  normalizePairingEngineUrl,
  parseEngineUrl,
} from "./pairingUtils";

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
  const [lanPreflight, setLanPreflight] = useState<LanPreflightState>(() => {
    const initialUrl = parseEngineUrl(
      getInviteCompanionUrl(window.location.search) || getEngineUrl(),
    );
    return {
      status:
        initialUrl && isLikelyCompanionUrl(initialUrl) ? "checking" : "idle",
    };
  });
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
  const preflightReady =
    lanPreflight.status === "complete" && lanPreflight.payload.ready === true;

  useEffect(() => {
    const refreshPairingState = () => {
      const currentToken = getEngineToken();
      setToken(currentToken);
      setEngineUrlInput(getEngineUrl());
      setPairingState(currentToken ? "paired" : "idle");
      setMessage(
        currentToken
          ? `${getScopeLabel(getEngineUrlScope(getEngineUrl()))} token is saved in this browser.`
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
        if (
          !(err instanceof ApiError && [401, 404, 503].includes(err.status))
        ) {
          console.warn("Failed to load backend local pairing:", err);
        }
      });
  }, []);

  useEffect(() => {
    const parsedUrl = parseEngineUrl(engineUrl);
    if (!isCompanionJoin || !parsedUrl || !isLikelyCompanionUrl(parsedUrl))
      return;

    let active = true;
    const checkPreflight = () => {
      fetchLanPreflight(normalizeEngineUrl(engineUrl))
        .then((payload) => {
          if (active) setLanPreflight({ payload, status: "complete" });
        })
        .catch(() => {
          if (active) setLanPreflight({ status: "unreachable" });
        });
    };
    checkPreflight();
    const interval = window.setInterval(checkPreflight, 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [engineUrl, isCompanionJoin]);

  const retryLanPreflight = async () => {
    const normalizedUrl = normalizeEngineUrl(engineUrl);
    setLanPreflight({ status: "checking" });
    try {
      const payload = await fetchLanPreflight(normalizedUrl);
      setLanPreflight({ payload, status: "complete" });
    } catch {
      setLanPreflight({ status: "unreachable" });
    }
  };

  const updateEngineUrl = (nextUrl: string) => {
    const parsedNextUrl = parseEngineUrl(nextUrl);
    setEngineUrlInput(nextUrl);
    setInviteJoinRequested(false);
    setLanPreflight({
      status:
        parsedNextUrl && isLikelyCompanionUrl(parsedNextUrl)
          ? "checking"
          : "idle",
    });
  };

  const updateInviteCode = (nextInviteCode: string) => {
    setInviteCode(nextInviteCode.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  };

  const pairEngine = async () => {
    const normalizedUrl = normalizePairingEngineUrl(engineUrl);
    if (normalizedUrl !== normalizeEngineUrl(engineUrl)) {
      setEngineUrlInput(normalizedUrl);
    }
    const parsedUrl = parseEngineUrl(normalizedUrl);
    const joiningWithInvite = Boolean(
      inviteJoinRequested && parsedUrl && isLikelyCompanionUrl(parsedUrl),
    );
    const normalizedInviteCode = inviteCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    let normalizedToken = token.trim();

    if (!normalizedUrl || (!joiningWithInvite && !normalizedToken)) {
      setPairingState("error");
      setMessage("Enter the engine URL and desktop pairing token.");
      return;
    }

    if (joiningWithInvite && !normalizedInviteCode) {
      setPairingState("error");
      setMessage("Enter the invite code from the host desktop app.");
      return;
    }

    if (joiningWithInvite && !preflightReady) {
      setPairingState("error");
      setMessage(
        "Complete the LAN join checks before entering the invite code.",
      );
      return;
    }

    if (!parsedUrl) {
      setPairingState("error");
      setMessage("Enter a valid engine URL, including http:// or https://.");
      return;
    }

    setPairingState("checking");
    setMessage(
      joiningWithInvite
        ? "Checking invite code..."
        : `Checking ${getScopeLabel(getEngineUrlScope(normalizedUrl)).toLowerCase()}...`,
    );

    try {
      if (joiningWithInvite) {
        const inviteResponse = await engineFetch(
          engineUrlEndpoint(normalizedUrl, "/invite/redeem"),
          {
            body: JSON.stringify({ code: normalizedInviteCode }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );

        if (!inviteResponse.ok) {
          const failurePayload = (await inviteResponse
            .json()
            .catch(() => ({}))) as InviteRedeemPayload;
          setPairingState("error");
          setMessage(
            getInviteFailureMessage(inviteResponse.status, failurePayload.code),
          );
          if ([410, 503].includes(inviteResponse.status)) {
            void retryLanPreflight();
          }
          return;
        }

        const invitePayload =
          (await inviteResponse.json()) as InviteRedeemPayload;
        if (!invitePayload.companionToken) {
          setPairingState("error");
          setMessage(
            "The host join page did not return a companion credential.",
          );
          return;
        }

        normalizedToken = createCompanionEngineToken(
          invitePayload.companionToken,
        );
      }

      const healthResponse = await engineFetch(
        engineUrlEndpoint(normalizedUrl, "/health"),
      );
      if (!healthResponse.ok) {
        setPairingState("error");
        setMessage(
          getPairingFailureMessage({
            error: new Error("Engine health check failed."),
            parsedUrl,
            scope: getEngineUrlScope(normalizedUrl),
            status: healthResponse.status,
          }),
        );
        return;
      }
      const health = (await healthResponse.json()) as EngineHealthPayload;
      const reportedExposureMode = health.exposureMode || "local";
      const actualScope = getEngineUrlScope(normalizedUrl);

      if (actualScope === "lan" && reportedExposureMode !== "lan") {
        setPairingState("error");
        setMessage(
          "That URL looks like a LAN address, but the engine reports local-only mode. Enable LAN mode in the desktop app and restart the engine.",
        );
        return;
      }

      const authResponse = await engineFetch(
        engineUrlEndpoint(normalizedUrl, "/local-games"),
        {
          headers: {
            "X-Engine-Token":
              getCompanionAccessToken(normalizedToken) || normalizedToken,
            "X-User-Id": "pairing-check",
          },
        },
      );

      if (!authResponse.ok) {
        setPairingState("error");
        setMessage(
          getPairingFailureMessage({
            error: new Error("Engine token check failed."),
            parsedUrl,
            scope: actualScope,
            status: authResponse.status,
          }),
        );
        return;
      }

      setEngineUrl(normalizedUrl);
      setEngineToken(normalizedToken);

      let successMessage = joiningWithInvite
        ? "Joined the host engine. Keep this page open while you play."
        : actualScope === "lan"
          ? "LAN engine paired. Keep the desktop app running while guests connect."
          : "Local engine paired.";

      try {
        await api.pairLocalEngine(normalizedUrl);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          successMessage = joiningWithInvite
            ? "Joined the host engine. Sign in to register pairing intent with the API."
            : "Engine token saved locally. Sign in to register pairing intent with the API.";
        } else {
          console.warn("Local engine paired, but API registration failed:", err);
          successMessage = joiningWithInvite
            ? "Joined the host engine. Backend pairing registration is unavailable."
            : "Engine token saved locally. Backend pairing registration is unavailable.";
        }
      }

      setPairingState("paired");
      setInviteJoinRequested(false);
      setMessage(successMessage);
      onPaired?.();
    } catch (err) {
      console.error("Failed to pair local engine:", err);
      setPairingState("error");
      setMessage(
        getPairingFailureMessage({
          error: err,
          parsedUrl,
          scope: getEngineUrlScope(normalizedUrl),
        }),
      );
    }
  };

  const disconnect = async () => {
    clearEngineToken();
    clearEngineUrl();
    setToken("");
    setEngineUrlInput(DEFAULT_ENGINE_URL);
    setPairingState("idle");
    setMessage("");

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
