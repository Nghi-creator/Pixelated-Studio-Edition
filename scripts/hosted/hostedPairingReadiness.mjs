import crypto from "node:crypto";
import { requestSmoke } from "../shared/smokeHttp.mjs";

export async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_HOSTED_WEB_ASSETS = 256;

function getJavaScriptAssetUrls(source, baseUrl, webOrigin) {
  const urls = new Set();
  const references = source.matchAll(/["'`]([^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g);
  for (const [, reference] of references) {
    try {
      const url = new URL(reference, baseUrl);
      if (url.origin === webOrigin && url.pathname.endsWith(".js")) {
        urls.add(url.toString());
      }
    } catch {
      // Ignore malformed strings that merely resemble asset paths.
    }
  }
  return urls;
}

export async function getHostedWebBuild({
  hostedPairingBuildMarker,
  hostedRuntimeSwitchBuildMarker,
  webUrl,
  signal,
}) {
  const { body: html } = await requestSmoke(`${webUrl}/engine`, { cache: "no-store", signal }, { format: "text" });
  const htmlSha256 = crypto.createHash("sha256").update(html).digest("hex");
  const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(
    ([, source]) => new URL(source, webUrl).toString(),
  );

  let hasLaunchPairing = html.includes(hostedPairingBuildMarker);
  let hasRuntimeSwitch = html.includes(hostedRuntimeSwitchBuildMarker);
  const webOrigin = new URL(webUrl).origin;
  const pendingScripts = [...scripts];
  const visitedScripts = new Set();
  while (
    pendingScripts.length > 0 &&
    visitedScripts.size < MAX_HOSTED_WEB_ASSETS &&
    !(hasLaunchPairing && hasRuntimeSwitch)
  ) {
    const script = pendingScripts.shift();
    if (!script || visitedScripts.has(script)) continue;
    visitedScripts.add(script);
    const { response: asset, body: source } = await requestSmoke(script,
      { cache: "no-store", signal }, { format: "text", expected: null });
    if (!asset.ok) continue;
    if (source.includes(hostedPairingBuildMarker)) {
      hasLaunchPairing = true;
    }
    if (source.includes(hostedRuntimeSwitchBuildMarker)) {
      hasRuntimeSwitch = true;
    }
    for (const referencedAsset of getJavaScriptAssetUrls(
      source,
      script,
      webOrigin,
    )) {
      if (!visitedScripts.has(referencedAsset)) {
        pendingScripts.push(referencedAsset);
      }
    }
  }
  return {
    assetCount: visitedScripts.size,
    hasLaunchPairing,
    hasRuntimeSwitch,
    htmlSha256,
  };
}

export async function waitForRenderApiDeploy({
  apiUrl,
  renderBaselineStartedAtSeconds,
  timeoutMs,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Readiness timeout must be positive.");
  const signal = AbortSignal.timeout(Math.ceil(timeoutMs));
  const deadline = performance.now() + timeoutMs;
  let lastError = "";

  while (performance.now() < deadline) {
    try {
      const [healthResponse, readyResponse] = await Promise.all([
        requestSmoke(`${apiUrl}/health`, { cache: "no-store", signal }),
        requestSmoke(`${apiUrl}/ready`, { cache: "no-store", signal }),
      ]);
      const health = healthResponse.body;
      const ready = readyResponse.body;
      const startedAtSeconds =
        Math.floor(Date.now() / 1000) - Number(health?.uptimeSeconds);
      const isNewProcess =
        !renderBaselineStartedAtSeconds ||
        startedAtSeconds > renderBaselineStartedAtSeconds;

      if (
        healthResponse.response.ok &&
        health?.ok === true &&
        readyResponse.response.ok &&
        ready?.ok === true &&
        isNewProcess
      ) {
        return;
      }
      lastError = `health=${healthResponse.response.status}/${JSON.stringify(health)} ready=${readyResponse.response.status}/${JSON.stringify(ready)} startedAtSeconds=${startedAtSeconds} baseline=${renderBaselineStartedAtSeconds || "none"}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(Math.max(0, Math.min(15_000, deadline - performance.now())));
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
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Readiness timeout must be positive.");
  const signal = AbortSignal.timeout(Math.ceil(timeoutMs));
  const deadline = performance.now() + timeoutMs;
  let lastError = "";

  while (performance.now() < deadline) {
    try {
      const build = await getHostedWebBuild({
        hostedPairingBuildMarker,
        hostedRuntimeSwitchBuildMarker,
        webUrl,
        signal,
      });
      const isNewBuild =
        !vercelBaselineHtmlSha256 ||
        build.htmlSha256 !== vercelBaselineHtmlSha256;
      if (build.hasLaunchPairing && build.hasRuntimeSwitch && isNewBuild) return;
      lastError = `htmlSha256=${build.htmlSha256} baseline=${vercelBaselineHtmlSha256 || "none"} pairingMarker=${build.hasLaunchPairing} runtimeSwitchMarker=${build.hasRuntimeSwitch} assets=${build.assetCount}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(Math.max(0, Math.min(15_000, deadline - performance.now())));
  }

  throw new Error(
    `Vercel did not publish the signed-in one-click pairing bundle within ${timeoutMs}ms: ${lastError}`,
  );
}
