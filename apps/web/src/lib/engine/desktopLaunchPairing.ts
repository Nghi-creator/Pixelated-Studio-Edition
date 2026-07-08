import { isAllowedEngineUrl } from "./engineConfig.ts";

type LaunchRedemption = {
  companionToken?: string;
};

type DesktopLaunchPairingDependencies = {
  createCompanionEngineToken: (token: string) => string;
  engineAuthHeaders: () => Record<string, string>;
  fetch: typeof fetch;
  pairLocalEngine: (engineUrl: string) => Promise<unknown>;
  replaceState: (url: URL) => void;
  setEngineControlToken: (token: string) => void;
  setEngineControlUrl: (engineUrl: string) => void;
  setEngineToken: (token: string) => void;
  setEngineUrl: (engineUrl: string) => void;
};

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

export async function pairFromDesktopLaunchUrl(
  url: URL,
  {
    createCompanionEngineToken,
    engineAuthHeaders,
    fetch,
    pairLocalEngine,
    replaceState,
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
    replaceState(scrubDesktopLaunchParams(url));
    return false;
  }

  try {
    const response = await fetch(`${companionUrl}/launch/redeem`, {
      body: JSON.stringify({ ticket: launchTicket }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as LaunchRedemption;
    if (!response.ok || !payload.companionToken) {
      console.error(
        `Desktop launch pairing failed with status ${response.status}.`,
      );
      replaceState(scrubDesktopLaunchParams(url));
      return false;
    }

    setEngineUrl(companionUrl);
    setEngineToken(createCompanionEngineToken(payload.companionToken));
    setEngineControlUrl(companionUrl);
    setEngineControlToken(payload.companionToken);
    fetch(`${companionUrl}/local-games`, {
      cache: "no-store",
      headers: {
        "X-User-Id": "connection-monitor",
        ...engineAuthHeaders(),
      },
    }).catch((error) => {
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
    replaceState(scrubDesktopLaunchParams(url));
    return false;
  }
}
