import { requestSmoke } from "../shared/smokeHttp.mjs";
import { runSmokeCleanup } from "../shared/smokeCleanup.mjs";
import { restorePairingSnapshot } from "./hostedPairingCleanup.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { assertHostedPairingContract } from "./hostedPairingContract.mjs";
import { probeHostedNativePairing } from "./hostedNativePairingProbe.mjs";
import { createHostedEngineProbe } from "./hostedPairingEngineProbe.mjs";
import {
  delay,
  waitForHostedWebPairingBundle as waitForHostedWebPairingBundleBase,
  waitForRenderApiDeploy as waitForRenderApiDeployBase,
} from "./hostedPairingReadiness.mjs";

const require = createRequire(import.meta.url);
if (process.argv.includes("--help")) {
  console.log(`Usage: npm run smoke:hosted-pairing

Required:
  HOSTED_SMOKE_EMAIL
  HOSTED_SUPABASE_URL
  HOSTED_SUPABASE_SERVICE_ROLE_KEY

Optional:
  HOSTED_WEB_URL
  HOSTED_API_URL
  HOSTED_SMOKE_ARTIFACT_DIR
  HOSTED_SMOKE_PUBLISH_TIMEOUT_MS
  HOSTED_SMOKE_RENDER_BASELINE_STARTED_AT_SECONDS
  HOSTED_SMOKE_VERCEL_BASELINE_HTML_SHA256

Validation:
  --contract-only`);
  process.exit(0);
}

const rootDir = path.resolve(import.meta.dirname, "../..");
const webUrl = normalizeUrl(
  process.env.HOSTED_WEB_URL || "https://pixelated-studio-edition.vercel.app",
);
const apiUrl = normalizeUrl(
  process.env.HOSTED_API_URL || "https://pixelated-api-services-6ovi.onrender.com",
);
const email = process.env.HOSTED_SMOKE_EMAIL || process.env.STAGING_SMOKE_EMAIL;
const supabaseUrl = normalizeUrl(process.env.HOSTED_SUPABASE_URL || "");
const serviceRoleKey = process.env.HOSTED_SUPABASE_SERVICE_ROLE_KEY || "";
const companionUrl = "https://localhost:8090";
const engineToken = `hosted-smoke-engine-${Date.now()}`;
const hostedPairingBuildMarker =
  "Desktop launch pairing registration v1 failed after local redemption.";
const hostedRuntimeSwitchBuildMarker =
  "Pixelated Desktop is still switching to the native Linux engine.";
const hostedPublishTimeoutMs = Number(
  process.env.HOSTED_SMOKE_PUBLISH_TIMEOUT_MS || 10 * 60 * 1000,
);
const renderBaselineStartedAtSeconds = Number(
  process.env.HOSTED_SMOKE_RENDER_BASELINE_STARTED_AT_SECONDS || 0,
);
const vercelBaselineHtmlSha256 =
  process.env.HOSTED_SMOKE_VERCEL_BASELINE_HTML_SHA256 || "";
const runId = `hosted-pairing-${new Date().toISOString().replaceAll(":", "-")}`;
const runDir = path.resolve(
  process.env.HOSTED_SMOKE_ARTIFACT_DIR ||
    path.join(rootDir, ".artifacts", "hosted-pairing-smoke", runId),
);
const reportPath = path.join(runDir, "hosted-pairing-report.json");
const summaryPath = path.join(runDir, "failure-summary.md");
const certDir = path.join(os.tmpdir(), runId);
const steps = [];
const browserConsole = [];
const browserNetwork = [];
const browserRequestFailures = [];
let browser;
let context;
let page;
let companion;
let bearerToken = "";
let previousPairing = null;
let pairingSnapshotTaken = false;
let createdSessionId = "";
const createdSessionIds = [];
const engineProbe = createHostedEngineProbe({ engineToken, webUrl });

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function required(value, name) {
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function record(name, status, detail = "") {
  steps.push({ detail, name, status, timestamp: new Date().toISOString() });
  console.log(`[${status}] ${name}${detail ? `: ${detail}` : ""}`);
}

async function step(name, action) {
  try {
    const result = await action();
    record(name, "pass");
    return result;
  } catch (error) {
    record(name, "fail", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

async function apiRequest(pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (options.auth !== false) headers.set("authorization", `Bearer ${bearerToken}`);
  if (options.body) headers.set("content-type", "application/json");
  const { body } = await requestSmoke(`${apiUrl}${pathname}`, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
  }, { expected: Array.isArray(options.expected) ? options.expected : [options.expected ?? 200] });
  return body;
}

async function adminRequest(pathname, options = {}) {
  const { body } = await requestSmoke(`${supabaseUrl}/auth/v1/admin${pathname}`, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
  });
  return body;
}

async function generateMagicLink() {
  const payload = await adminRequest(
    `/generate_link?redirect_to=${encodeURIComponent(webUrl)}`,
    {
      body: {
        email,
        type: "magiclink",
      },
      method: "POST",
    },
  );
  assert.equal(typeof payload?.action_link, "string");
  return payload.action_link;
}

async function getBrowserBearerToken() {
  return page.evaluate(() => {
    for (const [key, value] of Object.entries(window.localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed?.access_token === "string") return parsed.access_token;
      } catch {
        // Ignore unrelated local storage entries.
      }
    }
    return "";
  });
}

async function findCloudGameId() {
  const payload = await apiRequest("/games?page=1&pageSize=50", { auth: false });
  const game = payload.games?.find(
    (candidate) =>
      typeof candidate.id === "string" &&
      (candidate.rom_url || candidate.rom_filename),
  );
  if (!game) throw new Error("Hosted catalog has no game with a ROM target.");
  return game.id;
}

async function findDebianNativeGame() {
  let pageNumber = 1;
  let lastPayload = null;

  while (pageNumber <= 10) {
    const payload = await apiRequest(`/games?page=${pageNumber}&pageSize=50`, {
      auth: false,
    });
    lastPayload = payload;
    const game = payload.games?.find((candidate) =>
      candidate.game_builds?.some(
        (build) =>
          build.runtime_kind === "native_linux" &&
          build.runtime_id === "debian-native-v1" &&
          typeof build.launch_manifest_id === "string" &&
          build.launch_manifest_id.length > 0,
      ),
    );
    if (game) {
      return {
        build: game.game_builds.find(
          (candidate) => candidate.runtime_kind === "native_linux",
        ),
        game,
      };
    }
    if (!payload.totalPages || pageNumber >= payload.totalPages) break;
    pageNumber += 1;
  }

  throw new Error(
    `Hosted catalog has no published Debian native game with a launch manifest. lastPage=${JSON.stringify({
      page: lastPayload?.page,
      total: lastPayload?.total,
      totalPages: lastPayload?.totalPages,
    })}`,
  );
}

async function restorePreviousPairing() {
  if (!bearerToken) return;
  await restorePairingSnapshot({ captured: pairingSnapshotTaken, pairing: previousPairing }, apiRequest);
}

async function waitForRenderPairingRegistration() {
  const deadline = Date.now() + 30_000;
  let lastPayload = null;

  while (Date.now() < deadline) {
    lastPayload = await apiRequest("/local-pairings/current", {
      expected: [200, 404],
    });
    if (lastPayload?.pairing?.engineUrl === companionUrl) return lastPayload;
    await delay(1_000);
  }

  const pairingRequests = browserNetwork.filter((entry) =>
    entry.url.includes("/local-pairings"),
  );
  const pairingFailures = browserRequestFailures.filter((entry) =>
    entry.url.includes("/local-pairings"),
  );
  throw new Error(
    `Render did not persist the one-click pairing. last=${JSON.stringify(lastPayload)} responses=${JSON.stringify(pairingRequests)} failures=${JSON.stringify(pairingFailures)}`,
  );
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
    ["remove temporary certificates", () => fs.rmSync(certDir, { force: true, recursive: true })],
  ]);
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  if (process.argv.includes("--contract-only")) {
    await step(
      "verify hosted pairing contract in repository",
      () => assertHostedPairingContract(rootDir),
    );
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
  if (readinessFailure) throw readinessFailure.reason;

  await step("load compiled desktop companion", async () => {
    const modulePath = path.join(
      rootDir,
      "apps",
      "desktop",
      "dist",
      "main",
      "companion",
      "server.js",
    );
    assert.equal(fs.existsSync(modulePath), true, "Run the desktop build first.");
    companion = require(modulePath);
  });

  await step("start deterministic local engine probe", engineProbe.start);
  await step("start real desktop HTTPS companion", () =>
    companion.startCompanionServer({
      certDir,
      engineToken,
      lanAddresses: [],
      launchAllowedOrigins: [new URL(webUrl).origin],
      onRuntimeSwitch: engineProbe.requestRuntimeSwitch,
      port: 8090,
    }),
  );
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { height: 900, width: 1440 },
  });
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
    await page.waitForFunction(
      () =>
        Object.entries(window.localStorage).some(
          ([key, value]) =>
            key.startsWith("sb-") &&
            key.endsWith("-auth-token") &&
            value.includes("access_token"),
        ),
      null,
      { timeout: 30_000 },
    );
    await page.goto(`${webUrl}/home`, { waitUntil: "domcontentloaded" });
    bearerToken = await getBrowserBearerToken();
    assert.ok(bearerToken, "Hosted sign-in did not persist a Supabase session.");
    const me = await apiRequest("/me");
    assert.equal(typeof me.user?.id, "string");
  });

  await step("verify hosted browser can reach desktop companion", async () => {
    const probeTicket = companion.createCompanionLaunchTicket();
    const probe = await page.evaluate(
      async ({ companionUrl: target, ticket }) => {
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
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
            status: 0,
          };
        }
      },
      { companionUrl, ticket: probeTicket },
    );
    assert.equal(
      probe.ok,
      true,
      `Hosted browser could not redeem a companion probe ticket: ${JSON.stringify(probe)}`,
    );
    assert.equal(typeof probe.payload?.companionToken, "string");
  });

  previousPairing = await apiRequest("/local-pairings/current", {
    expected: [200, 404],
  }).then((payload) => payload?.pairing || null);
  pairingSnapshotTaken = true;

  await step("redeem and register desktop launch on hosted /engine", async () => {
    const launchTicket = companion.createCompanionLaunchTicket();
    const launchUrl = new URL("/engine", webUrl);
    launchUrl.searchParams.set("companionUrl", companionUrl);
    launchUrl.searchParams.set("launchTicket", launchTicket);
    await page.goto(launchUrl.toString(), { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () =>
          window.localStorage
            .getItem("pixelated_engine_token")
            ?.startsWith("companion:"),
        null,
        { timeout: 20_000 },
      );
    } catch {
      const launchRequests = browserNetwork.filter((entry) =>
        entry.url.includes("/launch/redeem"),
      );
      const launchFailures = browserRequestFailures.filter((entry) =>
        entry.url.includes("/launch/redeem"),
      );
      throw new Error(
        launchRequests.length === 0 && launchFailures.length === 0
          ? "The deployed /engine app did not request /launch/redeem. Vercel may still be serving a frontend bundle from before one-click pairing."
          : `The deployed /engine launch redemption did not save a companion token. responses=${JSON.stringify(launchRequests)} failures=${JSON.stringify(launchFailures)}`,
      );
    }
    await delay(2_500);
    assert.equal(
      await page.evaluate(() =>
        window.localStorage
          .getItem("pixelated_engine_token")
          ?.startsWith("companion:"),
      ),
      true,
      "The connection monitor cleared the redeemed companion token.",
    );
    await page.waitForFunction(
      () => !window.location.search.includes("launchTicket"),
    );
    assert.equal(
      await page.evaluate(() =>
        window.localStorage.getItem("pixelated_engine_url"),
      ),
      companionUrl,
    );
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
    await engineUrlInput.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      (expected) =>
        Array.from(document.querySelectorAll("input")).some(
          (input) => input.value === expected,
        ),
      companionUrl,
      { timeout: 20_000 },
    );
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
    const { build, game } = await findDebianNativeGame();
    const nativeSessionId = `hosted-native-smoke-${Date.now()}`;
    createdSessionIds.push(nativeSessionId);
    const result = await page.evaluate(
      probeHostedNativePairing,
      { apiUrl, gameId: game.id, sessionId: nativeSessionId },
    );

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
    assert.equal(
      result.activeRuntimeKind,
      "native_linux",
      JSON.stringify(result),
    );
    assert.equal(result.bootTarget, build.launch_manifest_id);
    assert.deepEqual(
      engineProbe.getRuntimeSwitches().map((entry) => entry.runtimeKind),
      ["native_linux"],
    );
  });
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  console.error(`Hosted pairing smoke failed: ${failure.message}`);
  if (page) {
    await page
      .screenshot({
        fullPage: true,
        path: path.join(runDir, "failure.png"),
      })
      .catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  const cleanupFailures = await cleanup();
  for (const entry of cleanupFailures) record(`cleanup: ${entry.name}`, "fail", entry.error);
  if (cleanupFailures.length) {
    failure ||= new Error("Hosted pairing cleanup failed; see report checks.");
    process.exitCode = 1;
  }
  writeJson(path.join(runDir, "browser-console.json"), browserConsole);
  writeJson(path.join(runDir, "browser-network.json"), browserNetwork);
  writeJson(
    path.join(runDir, "browser-request-failures.json"),
    browserRequestFailures,
  );
  writeJson(reportPath, {
    apiUrl,
    failure: failure?.message || null,
    finishedAt: new Date().toISOString(),
    runId,
    steps,
    webUrl,
  });
  fs.writeFileSync(
    summaryPath,
    [
      `# Hosted Pairing Smoke ${failure ? "Failed" : "Passed"}`,
      "",
      `- Web: ${webUrl}`,
      `- API: ${apiUrl}`,
      `- Run: ${runId}`,
      `- Result: ${failure ? failure.message : "All checks passed."}`,
      "",
      "## Checks",
      ...steps.map(
        ({ detail, name, status }) =>
          `- [${status === "pass" ? "x" : " "}] ${name}${detail ? `: ${detail}` : ""}`,
      ),
      "",
    ].join("\n"),
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, fs.readFileSync(summaryPath));
  }
  console.log(`Hosted pairing smoke bundle: ${runDir}`);
}
