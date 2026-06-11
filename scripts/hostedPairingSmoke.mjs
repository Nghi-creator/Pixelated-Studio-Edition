import assert from "node:assert/strict";
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
  HOSTED_SMOKE_ARTIFACT_DIR`);
  process.exit(0);
}

const rootDir = path.resolve(import.meta.dirname, "..");
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
const hostedPublishTimeoutMs = Number(
  process.env.HOSTED_SMOKE_PUBLISH_TIMEOUT_MS || 10 * 60 * 1000,
);
const runId = `hosted-pairing-${new Date().toISOString().replaceAll(":", "-")}`;
const runDir = path.resolve(
  process.env.HOSTED_SMOKE_ARTIFACT_DIR ||
    path.join(rootDir, ".context", "hosted-pairing-smoke", runId),
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

async function hostedWebHasLaunchPairing() {
  const response = await fetch(`${webUrl}/engine`, { cache: "no-store" });
  if (!response.ok) return false;
  const html = await response.text();
  const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(
    ([, source]) => new URL(source, webUrl).toString(),
  );

  for (const script of scripts) {
    const asset = await fetch(script, { cache: "no-store" });
    if (asset.ok && (await asset.text()).includes("/launch/redeem")) {
      return true;
    }
  }
  return false;
}

async function waitForHostedWebPairingBundle() {
  const deadline = Date.now() + hostedPublishTimeoutMs;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      if (await hostedWebHasLaunchPairing()) return;
      lastError = "production JavaScript does not contain /launch/redeem yet";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(15_000);
  }

  throw new Error(
    `Vercel did not publish the one-click pairing bundle within ${hostedPublishTimeoutMs}ms: ${lastError}`,
  );
}

function startEngineProbe() {
  engineServer = http.createServer((request, response) => {
    const origin = request.headers.origin;
    if (origin === new URL(webUrl).origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader(
        "access-control-allow-headers",
        "content-type,x-engine-token,x-user-id",
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
        }),
      );
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

async function cleanup() {
  if (createdSessionId && bearerToken) {
    await apiRequest(`/sessions/${createdSessionId}`, {
      expected: 204,
      method: "DELETE",
    }).catch(() => undefined);
  }
  await restorePreviousPairing().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  companion?.stopCompanionServer();
  if (engineServer) {
    await new Promise((resolve) => engineServer.close(resolve));
  }
  fs.rmSync(certDir, { force: true, recursive: true });
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });
  required(email, "HOSTED_SMOKE_EMAIL");
  required(password, "HOSTED_SMOKE_PASSWORD");

  await step("wait for Vercel one-click pairing bundle", waitForHostedWebPairingBundle);

  await step("load compiled desktop companion", async () => {
    const modulePath = path.join(
      rootDir,
      "apps",
      "desktop",
      "dist",
      "main",
      "companionServer.js",
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

  await step("redeem desktop launch ticket on hosted /engine", async () => {
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

  await step("register signed-in local pairing through hosted UI", async () => {
    const [pairingResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === `${apiUrl}/local-pairings`,
        { timeout: 20_000 },
      ),
      page.getByRole("button", { name: /^(Pair|Update)$/ }).click(),
    ]);
    if (pairingResponse.status() !== 200) {
      throw new Error(
        `Hosted UI pairing registration returned ${pairingResponse.status()}: ${await pairingResponse.text()}`,
      );
    }
    const saved = await apiRequest("/local-pairings/current");
    assert.equal(saved.pairing?.engineUrl, companionUrl);
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
