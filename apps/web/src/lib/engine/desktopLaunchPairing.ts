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
  const engineUrl = url.searchParams.get("engineUrl");
  const engineToken = url.searchParams.get("engineToken");
  const launchTicket = url.searchParams.get("launchTicket");
  const companionUrl = url.searchParams.get("companionUrl");

  if (engineUrl && engineToken) {
    setEngineUrl(engineUrl);
    setEngineToken(engineToken);
    if (companionUrl && launchTicket) {
      try {
        const response = await fetch(`${companionUrl}/launch/redeem`, {
          body: JSON.stringify({ ticket: launchTicket }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as LaunchRedemption;
        if (response.ok && payload.companionToken) {
          setEngineControlUrl(companionUrl);
          setEngineControlToken(payload.companionToken);
        } else {
          console.warn(
            `Desktop launch control pairing failed with status ${response.status}.`,
          );
        }
      } catch (error) {
        console.warn("Desktop launch control pairing failed.", error);
      }
    }
    fetch(`${engineUrl}/local-games`, {
      cache: "no-store",
      headers: {
        "X-Engine-Token": engineToken,
        "X-User-Id": "connection-monitor",
      },
    }).catch((error) => {
      console.warn("Desktop launch client presence ping failed.", error);
    });
    url.searchParams.delete("engineUrl");
    url.searchParams.delete("engineToken");
    url.searchParams.delete("companionUrl");
    url.searchParams.delete("launchTicket");
    replaceState(url);

    try {
      await pairLocalEngine(engineUrl);
    } catch (error) {
      console.warn(
        "Desktop launch pairing registration v1 failed after local launch.",
        error,
      );
    }
    return true;
  }

  if (!launchTicket || !companionUrl) return false;

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
    url.searchParams.delete("companionUrl");
    url.searchParams.delete("launchTicket");
    replaceState(url);

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
    return false;
  }
}
