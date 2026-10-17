import { createSmokeLog, redactSmokeText } from "../shared/smokeArtifacts.mjs";
import { runSmokeCleanup } from "../shared/smokeCleanup.mjs";
import { restorePairingSnapshot } from "./hostedPairingCleanup.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createHostedPairingBrowser } from "./hostedPairingBrowser.mjs";
import { assertHostedPairingContract } from "./hostedPairingContract.mjs";
import { probeHostedNativePairing } from "./hostedNativePairingProbe.mjs";
import { redeemHostedDesktopLaunch } from "./hostedDesktopLaunch.mjs";
import { createHostedEngineProbe } from "./hostedPairingEngineProbe.mjs";
import { createHostedPairingClient } from "./hostedPairingClient.mjs";
import { delay, waitForHostedWebPairingBundle as waitForHostedWebPairingBundleBase, waitForRenderApiDeploy as waitForRenderApiDeployBase } from "./hostedPairingReadiness.mjs";
const require = createRequire(import.meta.url);
export function createHostedPairingRun(config) {
  const { rootDir, webUrl, apiUrl, companionUrl, engineToken, hostedPairingBuildMarker, hostedRuntimeSwitchBuildMarker, hostedPublishTimeoutMs, renderBaselineStartedAtSeconds, vercelBaselineHtmlSha256, runDir, email, supabaseUrl, serviceRoleKey } = config;
  const steps = [];
  const browserConsole = createSmokeLog({ secrets: () => [serviceRoleKey, bearerToken, engineToken] });
  const browserNetwork = createSmokeLog();
  const browserRequestFailures = createSmokeLog({ secrets: () => [serviceRoleKey, bearerToken, engineToken] });
  let browser;
  let context;
  let page;
  let companion;
  let certDir = null;
  let bearerToken = "";
  let previousPairing = null;
  let pairingSnapshotTaken = false;
  let createdSessionId = "";
  const createdSessionIds = [];
  const engineProbe = createHostedEngineProbe({ engineToken, webUrl });
  const { apiRequest, generateMagicLink, findCloudGameId, findDebianNativeGame } = createHostedPairingClient({ ...config, getBearerToken: () => bearerToken });
  function required(value, name) {
    if (!value)
      throw new Error(`Missing required environment variable ${name}.`);
    return value;
  }
  function record(name, status, detail = "") {
    detail = redactSmokeText(detail, [serviceRoleKey, bearerToken, engineToken]);
    steps.push({ detail, name, status, timestamp: new Date().toISOString() });
    console.log(`[${status}] ${name}${detail ? `: ${detail}` : ""}`);
  }
  async function step(name, action) {
    try {
      const result = await action();
      record(name, "pass");
      return result;
    }
    catch (error) {
      record(name, "fail", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
  async function waitForRenderApiDeploy() {
    return waitForRenderApiDeployBase({
      apiUrl,
      renderBaselineStartedAtSeconds,
      timeoutMs: hostedPublishTimeoutMs,
    });
  }
  async function waitForHostedWebPairingBundle() {
    return waitForHostedWebPairingBundleBase({
      hostedPairingBuildMarker,
      hostedRuntimeSwitchBuildMarker,
      timeoutMs: hostedPublishTimeoutMs,
      vercelBaselineHtmlSha256,
      webUrl,
    });
  }
  async function getBrowserBearerToken() {
    return page.evaluate(() => {
      for (const [key, value] of Object.entries(window.localStorage)) {
        if (!key.startsWith("sb-") || !key.endsWith("-auth-token"))
          continue;
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed?.access_token === "string")
            return parsed.access_token;
        }
        catch {
          // Ignore unrelated local storage entries.
        }
      }
      return "";
    });
  }
  async function restorePreviousPairing() {
    if (!bearerToken)
      return;
    await restorePairingSnapshot({ captured: pairingSnapshotTaken, pairing: previousPairing }, apiRequest);
  }
  async function waitForRenderPairingRegistration() {
    const deadline = Date.now() + 30000;
    let lastPayload = null;
    while (Date.now() < deadline) {
      lastPayload = await apiRequest("/local-pairings/current", {
        expected: [200, 404],
      });
      if (lastPayload?.pairing?.engineUrl === companionUrl)
        return lastPayload;
      await delay(1000);
    }
    const pairingRequests = browserNetwork.filter((entry) => entry.url.includes("/local-pairings"));
    const pairingFailures = browserRequestFailures.filter((entry) => entry.url.includes("/local-pairings"));
    throw new Error(`Render did not persist the one-click pairing. last=${JSON.stringify(lastPayload)} responses=${JSON.stringify(pairingRequests)} failures=${JSON.stringify(pairingFailures)}`);
  }
  async function cleanup() {
    return runSmokeCleanup([
      ["close browser", () => browser?.close()],
      ...createdSessionIds.map(sessionId => [
        `delete session ${sessionId}`,
        () => apiRequest(`/sessions/${sessionId}`, { expected: [204, 404], method: "DELETE" }),
      ]),
      ["restore saved pairing", restorePreviousPairing],
      ["stop companion", () => companion?.stopCompanionServer()],
      ["stop engine probe", () => engineProbe.stop()],
      ["remove temporary certificates", () => { if (certDir) fs.rmSync(certDir, { force: true, recursive: true }); }],
    ]);
  }
  async function main() {
    fs.mkdirSync(runDir, { recursive: true });
    if (config.contractOnly) {
      await step("verify hosted pairing contract in repository", () => assertHostedPairingContract(rootDir));
      return;
    }
    required(email, "HOSTED_SMOKE_EMAIL");
    required(supabaseUrl, "HOSTED_SUPABASE_URL");
    required(serviceRoleKey, "HOSTED_SUPABASE_SERVICE_ROLE_KEY");
    const readiness = await Promise.allSettled([
      step("wait for new ready Render API process", waitForRenderApiDeploy),
      step("wait for Vercel one-click pairing bundle", waitForHostedWebPairingBundle),
    ]);
    const readinessFailure = readiness.find((result) => result.status === "rejected");
    if (readinessFailure)
      throw readinessFailure.reason;
    await step("load compiled desktop companion", async () => {
      const modulePath = path.join(rootDir, "apps", "desktop", "dist", "main", "companion", "server.js");
      assert.equal(fs.existsSync(modulePath), true, "Run the desktop build first.");
      companion = require(modulePath);
    });
    await step("start deterministic local engine probe", engineProbe.start);
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-hosted-companion-"));
    const { certPath } = await step("start real desktop HTTPS companion", () => companion.startCompanionServer({
      certDir,
      engineToken,
      lanAddresses: [],
      launchAllowedOrigins: [new URL(webUrl).origin],
      onRuntimeSwitch: engineProbe.requestRuntimeSwitch,
      port: 8090,
    }));
    ({ browser, context } = await createHostedPairingBrowser(chromium, fs.readFileSync(certPath)));
    await context.grantPermissions(["local-network-access"], {
      origin: new URL(webUrl).origin,
    });
    page = await context.newPage();
    page.on("console", (message) => {
      browserConsole.push({
        text: message.text(),
        type: message.type(),
      });
    });
    page.on("response", (response) => {
      browserNetwork.push({
        method: response.request().method(),
        status: response.status(),
        url: response.url().replace(/[?&]launchTicket=[^&]+/, ""),
      });
    });
    page.on("requestfailed", (request) => {
      browserRequestFailures.push({
        error: request.failure()?.errorText || "unknown request failure",
        method: request.method(),
        url: request.url().replace(/[?&]launchTicket=[^&]+/, ""),
      });
    });
    await step("establish hosted browser session", async () => {
      await page.goto(await generateMagicLink(), { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Object.entries(window.localStorage).some(([key, value]) => key.startsWith("sb-") &&
        key.endsWith("-auth-token") &&
        value.includes("access_token")), null, { timeout: 30000 });
      await page.goto(`${webUrl}/home`, { waitUntil: "domcontentloaded" });
      bearerToken = await getBrowserBearerToken();
      assert.ok(bearerToken, "Hosted sign-in did not persist a Supabase session.");
      const me = await apiRequest("/me");
      assert.equal(typeof me.user?.id, "string");
    });
    await step("verify hosted browser can reach desktop companion", async () => {
      const probeTicket = companion.createCompanionLaunchTicket();
      const probe = await page.evaluate(async ({ companionUrl: target, ticket }) => {
        try {
          const response = await fetch(`${target}/launch/redeem`, {
            body: JSON.stringify({ ticket }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          return {
            ok: response.ok,
            payload: await response.json().catch(() => null),
            status: response.status,
          };
        }
        catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
            status: 0,
          };
        }
      }, { companionUrl, ticket: probeTicket });
      assert.equal(probe.ok, true, `Hosted browser could not redeem a companion probe ticket: ${JSON.stringify(probe)}`);
      assert.equal(typeof probe.payload?.companionToken, "string");
    });
    previousPairing = await apiRequest("/local-pairings/current", {
      expected: [200, 404],
    }).then((payload) => payload?.pairing || null);
    pairingSnapshotTaken = true;
    await step("redeem and register desktop launch on hosted /engine", async () => {
      try {
        await redeemHostedDesktopLaunch({
          page, webUrl, companionUrl,
          createLaunchTicket: () => companion.createCompanionLaunchTicket(),
        });
      }
      catch {
        const launchRequests = browserNetwork.filter((entry) => entry.url.includes("/launch/redeem"));
        const launchFailures = browserRequestFailures.filter((entry) => entry.url.includes("/launch/redeem"));
        throw new Error(launchRequests.length === 0 && launchFailures.length === 0
          ? "The deployed /engine app did not request /launch/redeem. Vercel may still be serving a frontend bundle from before one-click pairing."
          : `The deployed /engine launch redemption did not save a companion token. responses=${JSON.stringify(launchRequests)} failures=${JSON.stringify(launchFailures)}`);
      }
      await delay(2500);
      assert.equal(await page.evaluate(() => window.localStorage
        .getItem("pixelated_engine_token")
        ?.startsWith("companion:")), true, "The connection monitor cleared the redeemed companion token.");
      await page.waitForFunction(() => !window.location.search.includes("launchTicket"));
      assert.equal(await page.evaluate(() => window.localStorage.getItem("pixelated_engine_url")), companionUrl);
      await page.screenshot({
        fullPage: true,
        path: path.join(runDir, "01-launch-ticket-redeemed.png"),
      });
    });
    await step("verify signed-in Render pairing registration", async () => {
      await waitForRenderPairingRegistration();
      await page.screenshot({
        fullPage: true,
        path: path.join(runDir, "02-render-pairing-registered.png"),
      });
    });
    await step("restore paired companion URL from Render metadata", async () => {
      await page.evaluate(() => {
        window.localStorage.removeItem("pixelated_engine_token");
        window.localStorage.removeItem("pixelated_engine_url");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      const engineUrlInput = page.getByLabel("Engine URL");
      await engineUrlInput.waitFor({ state: "visible", timeout: 20000 });
      await page.waitForFunction((expected) => Array.from(document.querySelectorAll("input")).some((input) => input.value === expected), companionUrl, { timeout: 20000 });
      assert.equal(await engineUrlInput.inputValue(), companionUrl);
      await page.screenshot({
        fullPage: true,
        path: path.join(runDir, "03-render-pairing-restored.png"),
      });
    });
    await step("create and verify Render cloud session", async () => {
      const gameId = await findCloudGameId();
      createdSessionId = `hosted-browser-smoke-${Date.now()}`;
      createdSessionIds.push(createdSessionId);
      const created = await apiRequest("/sessions", {
        body: { clientSessionId: createdSessionId, gameId, mode: "cloud" },
        method: "POST",
      });
      assert.equal(created.sessionId, createdSessionId);
      assert.equal(typeof created.sessionToken, "string");
      const verified = await apiRequest(`/sessions/${createdSessionId}/verify`, {
        auth: false,
        body: { sessionToken: created.sessionToken },
        method: "POST",
      });
      assert.equal(verified.sessionId, createdSessionId);
      assert.ok(verified.boot?.romUrl || verified.boot?.romFilename);
    });
    await step("switch hosted pairing to native Linux and resolve Debian-native boot", async () => {
      // The metadata-restoration check deliberately removed the saved credentials.
      // Its populated form does not restore an authenticated local connection.
      await redeemHostedDesktopLaunch({
        page, webUrl, companionUrl,
        createLaunchTicket: () => companion.createCompanionLaunchTicket(),
      });
      await waitForRenderPairingRegistration();
      const { build, game } = await findDebianNativeGame();
      const nativeSessionId = `hosted-native-smoke-${Date.now()}`;
      createdSessionIds.push(nativeSessionId);
      const result = await page.evaluate(probeHostedNativePairing, { apiUrl, gameId: game.id, sessionId: nativeSessionId });
      assert.equal(result.error, undefined, JSON.stringify(result));
      assert.equal(result.created?.sessionId, nativeSessionId);
      assert.equal(result.created?.boot?.runtimeKind, "native_linux");
      assert.equal(result.created?.boot?.runtimeId, "debian-native-v1");
      assert.equal(result.created?.boot?.launchManifestId, build.launch_manifest_id);
      assert.equal(result.created?.boot?.romUrl, null);
      assert.equal(result.created?.boot?.romFilename, null);
      assert.equal(result.verified?.sessionId, nativeSessionId);
      assert.equal(result.verified?.boot?.runtimeKind, "native_linux");
      assert.equal(result.verified?.boot?.launchManifestId, build.launch_manifest_id);
      assert.equal(result.activeRuntimeKind, "native_linux", JSON.stringify(result));
      assert.equal(result.bootTarget, build.launch_manifest_id);
      assert.deepEqual(engineProbe.getRuntimeSwitches().map((entry) => entry.runtimeKind), ["native_linux"]);
    });
  }
  return { main, cleanup, record, state: () => ({ steps, browserConsole: browserConsole.entries, browserNetwork: browserNetwork.entries, browserRequestFailures: browserRequestFailures.entries, logDrops: { console: browserConsole.dropped, network: browserNetwork.dropped, requestFailures: browserRequestFailures.dropped } }), async captureFailure() {
      if (page)
        await page.screenshot({ fullPage: true, path: path.join(runDir, "failure.png") }).catch(() => undefined);
    } };
}
