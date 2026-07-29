import { isAllowedEngineUrl } from "./engineConfig.ts";

type LaunchRedemption = {
  companionToken?: string;
  expiresAt?: string;
};

type DesktopLaunchPairingDependencies = {
  createCompanionEngineToken: (token: string) => string;
  engineAuthHeaders: () => Record<string, string>;
  fetch: typeof fetch;
  pairLocalEngine: (engineUrl: string) => Promise<unknown>;
  replaceState: (url: URL) => void;
  setConnectionStatus?: (
    status: "checking" | "offline" | "online" | "rejected",
  ) => void;
  setEngineControlToken: (token: string) => void;
  setEngineControlUrl: (engineUrl: string) => void;
  setEngineToken: (token: string, expiresAt?: string) => void;
  setEngineUrl: (engineUrl: string) => void;
};

const LAUNCH_REDEEM_TIMEOUT_MS = 5_000;
const LAUNCH_REDEEM_RETRY_DELAY_MS = 250;

function getPostPairingUrl(url: URL) {
  if (url.pathname !== "/") return url;

  const nextUrl = new URL(url);
  nextUrl.pathname = "/home";
  return nextUrl;
}

function scrubDesktopLaunchParams(url: URL) {
  url.searchParams.delete("engineUrl");
  url.searchParams.delete("engineToken");
  url.searchParams.delete("companionUrl");
  url.searchParams.delete("launchTicket");
  return getPostPairingUrl(url);
}

function getFailedLaunchUrl(url: URL, reason: string) {
  const failedUrl = scrubDesktopLaunchParams(url);
  failedUrl.pathname = "/engine";
  failedUrl.searchParams.set("desktopLaunchError", reason);
  return failedUrl;
}

async function waitForRetry() {
  await new Promise((resolve) =>
    globalThis.setTimeout(resolve, LAUNCH_REDEEM_RETRY_DELAY_MS),
  );
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchImpl(url, init),
      new Promise<never>((_resolve, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error("Desktop launch redemption timed out.")),
          LAUNCH_REDEEM_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export async function pairFromDesktopLaunchUrl(
  url: URL,
  {
    createCompanionEngineToken,
    engineAuthHeaders,
    fetch,
    pairLocalEngine,
    replaceState,
    setConnectionStatus = () => undefined,
    setEngineControlToken,
    setEngineControlUrl,
    setEngineToken,
    setEngineUrl,
  }: DesktopLaunchPairingDependencies,
) {
  const launchTicket = url.searchParams.get("launchTicket");
  const companionUrl = url.searchParams.get("companionUrl");

  if (url.searchParams.has("engineUrl") || url.searchParams.has("engineToken")) {
    console.error("Desktop launch pairing rejected legacy raw token parameters.");
    replaceState(scrubDesktopLaunchParams(url));
    return false;
  }

  if (!launchTicket || !companionUrl) return false;
  if (!isAllowedEngineUrl(companionUrl)) {
    console.error("Desktop launch pairing rejected an unsafe companion URL.");
    setConnectionStatus("offline");
    replaceState(getFailedLaunchUrl(url, "unsafe_companion_url"));
    return false;
  }

  setConnectionStatus("checking");
  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchWithTimeout(
          fetch,
          `${companionUrl}/launch/redeem`,
          {
            body: JSON.stringify({ ticket: launchTicket }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
      } catch (error) {
        if (attempt === 0) {
          await waitForRetry();
          continue;
        }
        throw error;
      }
      if (response.status !== 503 || attempt > 0) break;
      await waitForRetry();
    }

    if (!response) throw new Error("Desktop launch redemption failed.");
    const payload = (await response.json()) as LaunchRedemption;
    if (!response.ok || !payload.companionToken) {
      console.error(
        `Desktop launch pairing failed with status ${response.status}.`,
      );
      setConnectionStatus(response.status === 401 ? "rejected" : "offline");
      replaceState(
        getFailedLaunchUrl(
          url,
          response.status === 401 ? "ticket_invalid" : "engine_unavailable",
        ),
      );
      return false;
    }

    setEngineUrl(companionUrl);
    setEngineToken(
      createCompanionEngineToken(payload.companionToken),
      payload.expiresAt,
    );
    setEngineControlUrl(companionUrl);
    setEngineControlToken(payload.companionToken);
    setConnectionStatus("online");
    fetch(`${companionUrl}/health/connection`, {
      cache: "no-store",
      headers: {
        ...engineAuthHeaders(),
      },
    })
      .then((presenceResponse) => {
        if (presenceResponse.ok) return;
        setConnectionStatus(
          [401, 403].includes(presenceResponse.status)
            ? "rejected"
            : "offline",
        );
      })
      .catch((error) => {
        setConnectionStatus("offline");
        console.warn("Desktop launch client presence ping failed.", error);
      });
    replaceState(scrubDesktopLaunchParams(url));

    try {
      await pairLocalEngine(companionUrl);
    } catch (error) {
      console.warn(
        "Desktop launch pairing registration v1 failed after local redemption.",
        error,
      );
    }
    return true;
  } catch (error) {
    console.error(
      "Desktop launch pairing could not reach the companion.",
      error,
    );
    setConnectionStatus("offline");
    replaceState(getFailedLaunchUrl(url, "companion_unreachable"));
    return false;
  }
}
