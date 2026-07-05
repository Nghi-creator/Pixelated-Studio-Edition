import crypto from "node:crypto";

export async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHostedWebBuild({
  hostedPairingBuildMarker,
  hostedRuntimeSwitchBuildMarker,
  webUrl,
}) {
  const response = await fetch(`${webUrl}/engine`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GET /engine returned ${response.status}`);
  }
  const html = await response.text();
  const htmlSha256 = crypto.createHash("sha256").update(html).digest("hex");
  const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(
    ([, source]) => new URL(source, webUrl).toString(),
  );

  let hasLaunchPairing = html.includes(hostedPairingBuildMarker);
  let hasRuntimeSwitch = html.includes(hostedRuntimeSwitchBuildMarker);
  for (const script of scripts) {
    const asset = await fetch(script, { cache: "no-store" });
    if (!asset.ok) continue;
    const source = await asset.text();
    if (source.includes(hostedPairingBuildMarker)) {
      hasLaunchPairing = true;
    }
    if (source.includes(hostedRuntimeSwitchBuildMarker)) {
      hasRuntimeSwitch = true;
    }
  }
  return { hasLaunchPairing, hasRuntimeSwitch, htmlSha256 };
}

export async function waitForRenderApiDeploy({
  apiUrl,
  renderBaselineStartedAtSeconds,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const [healthResponse, readyResponse] = await Promise.all([
        fetch(`${apiUrl}/health`, { cache: "no-store" }),
        fetch(`${apiUrl}/ready`, { cache: "no-store" }),
      ]);
      const health = await healthResponse.json();
      const ready = await readyResponse.json();
      const startedAtSeconds =
        Math.floor(Date.now() / 1000) - Number(health?.uptimeSeconds);
      const isNewProcess =
        !renderBaselineStartedAtSeconds ||
        startedAtSeconds > renderBaselineStartedAtSeconds;

      if (
        healthResponse.ok &&
        health?.ok === true &&
        readyResponse.ok &&
        ready?.ok === true &&
        isNewProcess
      ) {
        return;
      }
      lastError = `health=${healthResponse.status}/${JSON.stringify(health)} ready=${readyResponse.status}/${JSON.stringify(ready)} startedAtSeconds=${startedAtSeconds} baseline=${renderBaselineStartedAtSeconds || "none"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(15_000);
  }

  throw new Error(
    `Render did not publish a new ready API process within ${timeoutMs}ms: ${lastError}`,
  );
}

export async function waitForHostedWebPairingBundle({
  hostedPairingBuildMarker,
  hostedRuntimeSwitchBuildMarker,
  timeoutMs,
  vercelBaselineHtmlSha256,
  webUrl,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const build = await getHostedWebBuild({
        hostedPairingBuildMarker,
        hostedRuntimeSwitchBuildMarker,
        webUrl,
      });
      const isNewBuild =
        !vercelBaselineHtmlSha256 ||
        build.htmlSha256 !== vercelBaselineHtmlSha256;
      if (build.hasLaunchPairing && build.hasRuntimeSwitch && isNewBuild) return;
      lastError = `htmlSha256=${build.htmlSha256} baseline=${vercelBaselineHtmlSha256 || "none"} pairingMarker=${build.hasLaunchPairing} runtimeSwitchMarker=${build.hasRuntimeSwitch}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(15_000);
  }

  throw new Error(
    `Vercel did not publish the signed-in one-click pairing bundle within ${timeoutMs}ms: ${lastError}`,
  );
}
