import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
if (process.argv.includes("--help")) {
  console.log(`Usage: npm run smoke:hosted-pairing

Required:
  HOSTED_SMOKE_EMAIL
  HOSTED_SMOKE_PASSWORD

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
  process.env.HOSTED_API_URL || "https://pixelated-api-services.onrender.com",
);
const email = process.env.HOSTED_SMOKE_EMAIL || process.env.STAGING_SMOKE_EMAIL;
const password =
  process.env.HOSTED_SMOKE_PASSWORD || process.env.STAGING_SMOKE_PASSWORD;
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
let engineServer;
let companion;
let bearerToken = "";
let previousPairing = null;
let createdSessionId = "";
const createdSessionIds = [];
let probeRuntimeKind = "libretro";
const probeRuntimeSwitches = [];

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHostedWebBuild() {
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

async function waitForRenderApiDeploy() {
  const deadline = Date.now() + hostedPublishTimeoutMs;
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
    `Render did not publish a new ready API process within ${hostedPublishTimeoutMs}ms: ${lastError}`,
  );
}

async function waitForHostedWebPairingBundle() {
  const deadline = Date.now() + hostedPublishTimeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const build = await getHostedWebBuild();
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
    `Vercel did not publish the signed-in one-click pairing bundle within ${hostedPublishTimeoutMs}ms: ${lastError}`,
  );
}

function startEngineProbe() {
  probeRuntimeKind = "libretro";
  probeRuntimeSwitches.length = 0;
  engineServer = http.createServer((request, response) => {
    const origin = request.headers.origin;
    if (origin === new URL(webUrl).origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader(
        "access-control-allow-headers",
        "content-type,x-engine-token,x-pixelated-client-id,x-user-id",
      );
      response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      if (request.headers["access-control-request-private-network"] === "true") {
        response.setHeader("access-control-allow-private-network", "true");
      }
      response.setHeader("vary", "Origin");
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.url?.startsWith("/health")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          engineTokenRequired: true,
          exposureMode: "local",
          ok: true,
          runtimeKind: probeRuntimeKind,
        }),
      );
      return;
    }

    if (request.url?.startsWith("/session/stop-active")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ stopped: false }));
      return;
    }

    if (request.url?.startsWith("/local-games")) {
      const authorized = request.headers["x-engine-token"] === engineToken;
      response.writeHead(authorized ? 200 : 401, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(authorized ? { games: [] } : { error: "unauthorized" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve, reject) => {
    engineServer.once("error", reject);
    engineServer.listen(8080, "127.0.0.1", resolve);
  });
}

async function requestProbeRuntimeSwitch(runtimeKind) {
  probeRuntimeSwitches.push({
    runtimeKind,
    timestamp: new Date().toISOString(),
  });
  if (probeRuntimeKind === runtimeKind) {
    return { runtimeKind, status: "unchanged" };
  }
  probeRuntimeKind = runtimeKind;
  return { runtimeKind, status: "restarting" };
}

async function apiRequest(pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (options.auth !== false) headers.set("authorization", `Bearer ${bearerToken}`);
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  const expected = Array.isArray(options.expected)
    ? options.expected
    : [options.expected ?? 200];
  if (!expected.includes(response.status)) {
    throw new Error(
      `${options.method || "GET"} ${pathname} returned ${response.status}: ${text}`,
    );
  }
  return payload;
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
  if (previousPairing?.engineUrl) {
    await apiRequest("/local-pairings", {
      body: { engineUrl: previousPairing.engineUrl },
      method: "POST",
    });
    return;
  }
  await apiRequest("/local-pairings/current", {
    expected: 204,
    method: "DELETE",
  });
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
  if (bearerToken) {
    for (const sessionId of createdSessionIds) {
      await apiRequest(`/sessions/${sessionId}`, {
        expected: 204,
        method: "DELETE",
      }).catch(() => undefined);
    }
  }
  await browser?.close().catch(() => undefined);
  await restorePreviousPairing().catch(() => undefined);
  companion?.stopCompanionServer();
  if (engineServer) {
    await new Promise((resolve) => engineServer.close(resolve));
  }
  fs.rmSync(certDir, { force: true, recursive: true });
}

function assertHostedPairingContract() {
  const desktopController = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "desktop",
      "main",
      "engine",
      "controller.ts",
    ),
    "utf8",
  );
  const desktopCompanion = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "desktop",
      "main",
      "companion",
      "server.ts",
    ),
    "utf8",
  );
  const launchPairing = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "lib",
      "engine",
      "desktopLaunchPairing.ts",
    ),
    "utf8",
  );
  const launchPairingHook = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "lib",
      "engine",
      "useDesktopLaunchPairing.ts",
    ),
    "utf8",
  );
  const enginePairingPanel = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "features",
      "local-engine",
      "EnginePairingPanel.tsx",
    ),
    "utf8",
  );
  const authSource = fs.readFileSync(
    path.join(rootDir, "apps", "web", "src", "pages", "user", "Auth.tsx"),
    "utf8",
  );
  const webRtcSession = fs.readFileSync(
    path.join(rootDir, "apps", "web", "src", "lib", "webrtc", "webrtcSession.ts"),
    "utf8",
  );

  assert.match(desktopController, /createHostedWebLaunchUrl/);
  assert.match(desktopController, /createCompanionLaunchTicket/);
  assert.match(desktopCompanion, /createCompanionLaunchTicket/);
  assert.match(desktopCompanion, /startCompanionServer/);
  assert.match(launchPairingHook, /pairFromDesktopLaunchUrl/);
  assert.match(launchPairing, /engineUrl[\s\S]*engineToken/);
  assert.match(launchPairing, /setEngineToken\(engineToken\)/);
  assert.match(launchPairing, /companionUrl[\s\S]*launchTicket/);
  assert.match(launchPairing, /createCompanionEngineToken\(payload\.companionToken\)/);
  assert.match(launchPairing, /Desktop launch pairing registration v1 failed/);
  assert.match(launchPairing, /pairLocalEngine/);
  assert.match(
    webRtcSession,
    /requestEngineRuntimeSwitch\(requiredRuntimeKind\)[\s\S]*waitForEngineRuntimeKind\(requiredRuntimeKind\)[\s\S]*launchManifestId/,
  );
  assert.match(desktopCompanion, /RUNTIME_SWITCH_PATH/);
  assert.match(desktopCompanion, /onRuntimeSwitch/);
  assert.match(enginePairingPanel, /Engine URL/);
  assert.match(authSource, /Sign In/);
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  if (process.argv.includes("--contract-only")) {
    await step(
      "verify hosted pairing contract in repository",
      assertHostedPairingContract,
    );
    return;
  }

  required(email, "HOSTED_SMOKE_EMAIL");
  required(password, "HOSTED_SMOKE_PASSWORD");

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

  await step("start deterministic local engine probe", startEngineProbe);
  await step("start real desktop HTTPS companion", () =>
    companion.startCompanionServer({
      certDir,
      engineToken,
      lanAddresses: [],
      launchAllowedOrigins: [new URL(webUrl).origin],
      onRuntimeSwitch: requestProbeRuntimeSwitch,
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

  await step("sign in through hosted Vercel UI", async () => {
    await page.goto(`${webUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Email address").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
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
      async ({ apiUrl: apiBaseUrl, gameId, sessionId }) => {
        const authToken = (() => {
          for (const [key, value] of Object.entries(window.localStorage)) {
            if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
            try {
              const parsed = JSON.parse(value);
              if (typeof parsed?.access_token === "string") {
                return parsed.access_token;
              }
            } catch {
              // Ignore unrelated local storage entries.
            }
          }
          return "";
        })();
        const engineUrl = window.localStorage.getItem("pixelated_engine_url");
        const engineControlUrl =
          window.localStorage.getItem("pixelated_engine_control_url") || engineUrl;
        const engineTokenValue =
          window.localStorage.getItem("pixelated_engine_control_token") ||
          window.localStorage.getItem("pixelated_engine_token") ||
          "";
        const companionToken = engineTokenValue.startsWith("companion:")
          ? engineTokenValue.slice("companion:".length)
          : engineTokenValue;
        const engineHeaders = {
          "X-Engine-Token": companionToken,
          "X-Pixelated-Client-Id": "hosted-native-smoke",
        };
        const getLocalCompanionControlUrl = (target) => {
          try {
            const url = new URL(target);
            const hostname = url.hostname.toLowerCase();
            const isLocalhost =
              hostname === "localhost" ||
              hostname === "127.0.0.1" ||
              hostname === "::1" ||
              hostname === "[::1]";
            if (!isLocalhost || url.port !== "8080") return null;
            url.protocol = "http:";
            url.port = "8091";
            return url.toString().replace(/\/$/, "");
          } catch {
            return null;
          }
        };
        const fallbackControlUrl =
          engineControlUrl === engineUrl
            ? getLocalCompanionControlUrl(engineControlUrl)
            : null;
        const healthUrls = [
          engineControlUrl,
          engineUrl,
          fallbackControlUrl,
        ].filter((entry, index, entries) => entry && entries.indexOf(entry) === index);
        const healthAttempts = [];
        const getEngineHealth = async () => {
          for (const healthUrl of healthUrls) {
            const response = await fetch(`${healthUrl}/health`, {
              cache: "no-store",
              headers: engineHeaders,
            }).catch((error) => {
              healthAttempts.push({
                error: error instanceof Error ? error.message : String(error),
                url: healthUrl,
              });
              return null;
            });
            if (!response) continue;
            const health = await response.json().catch((error) => {
              healthAttempts.push({
                error: error instanceof Error ? error.message : String(error),
                status: response.status,
                url: healthUrl,
              });
              return null;
            });
            healthAttempts.push({
              ok: response.ok,
              runtimeKind: health?.runtimeKind || "",
              status: response.status,
              url: healthUrl,
            });
            if (response.ok && health) return health;
          }
          return null;
        };
        const postEngineControl = async (path, body) => {
          const request = (controlUrl) =>
            fetch(`${controlUrl}${path}`, {
              body: body ? JSON.stringify(body) : undefined,
              cache: "no-store",
              headers: {
                ...engineHeaders,
                ...(body ? { "content-type": "application/json" } : {}),
              },
              method: "POST",
            });
          let response = await request(engineControlUrl).catch((error) => {
            if (!fallbackControlUrl) throw error;
            return request(fallbackControlUrl);
          });
          if (
            fallbackControlUrl &&
            engineControlUrl !== fallbackControlUrl &&
            [404, 405].includes(response.status)
          ) {
            response = await request(fallbackControlUrl);
          }
          return response;
        };

        const createResponse = await fetch(`${apiBaseUrl}/sessions`, {
          body: JSON.stringify({
            clientSessionId: sessionId,
            gameId,
            mode: "cloud",
          }),
          headers: {
            authorization: `Bearer ${authToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        });
        const created = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
          return {
            created,
            error: `session create returned ${createResponse.status}`,
          };
        }
        const verifyResponse = await fetch(
          `${apiBaseUrl}/sessions/${sessionId}/verify`,
          {
            body: JSON.stringify({ sessionToken: created.sessionToken }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        const verified = await verifyResponse.json().catch(() => null);
        if (!verifyResponse.ok) {
          return {
            created,
            error: `session verify returned ${verifyResponse.status}`,
            verified,
          };
        }

        const beforeHealth = await getEngineHealth();
        if (created.boot?.runtimeKind !== beforeHealth?.runtimeKind) {
          await postEngineControl("/session/stop-active");
          const switchResponse = await postEngineControl("/runtime/switch", {
            runtimeKind: created.boot?.runtimeKind,
          });
          const switchPayload = await switchResponse.json().catch(() => null);
          if (![200, 202].includes(switchResponse.status)) {
            return {
              beforeHealth,
              created,
              error: `runtime switch returned ${switchResponse.status}`,
              switchPayload,
            };
          }
        }

        let activeHealth = null;
        let activeRuntimeKind = "";
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const health = await getEngineHealth();
          activeHealth = health;
          activeRuntimeKind = health?.runtimeKind || "";
          if (activeRuntimeKind === created.boot?.runtimeKind) break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        return {
          activeHealth,
          activeRuntimeKind,
          healthAttempts: healthAttempts.slice(-20),
          bootTarget:
            created.boot?.launchManifestId ||
            created.boot?.romUrl ||
            created.boot?.romFilename ||
            null,
          created,
          verified,
        };
      },
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
      probeRuntimeSwitches.map((entry) => entry.runtimeKind),
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
  await cleanup();
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
