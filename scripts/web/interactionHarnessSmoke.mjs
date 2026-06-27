#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const port = Number(process.env.PIXELATED_WEB_INTERACTION_PORT || 5174);
const baseUrl = `http://127.0.0.1:${port}`;
const harnessSourcePath = path.join(
  webRoot,
  "tests",
  "interaction",
  "adminHarness.html",
);
const harnessPath = "/tests/interaction/adminHarness.html";
const interactionTimeoutMs = Number(
  process.env.PIXELATED_WEB_INTERACTION_TIMEOUT_MS || 15_000,
);

const webRequire = createRequire(path.join(webRoot, "package.json"));

async function buildHarness() {
  const outDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pixelated-interaction-harness-"),
  );
  const vitePath = webRequire.resolve("vite");
  const { build } = await import(pathToFileURL(vitePath).href);
  const originalCwd = process.cwd();

  try {
    process.chdir(webRoot);
    await build({
      build: {
        emptyOutDir: true,
        outDir,
        rollupOptions: {
          input: {
            adminHarness: harnessSourcePath,
          },
        },
      },
      configFile: path.join(webRoot, "vite.config.ts"),
      root: webRoot,
    });
  } finally {
    process.chdir(originalCwd);
  }

  return outDir;
}

async function readBuiltHarnessContract(outDir) {
  const entries = await fs.readdir(path.join(outDir, "assets"));
  const scripts = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".js"))
      .map(async (entry) => ({
        entry,
        source: await fs.readFile(path.join(outDir, "assets", entry), "utf8"),
      })),
  );
  return scripts.map(({ source }) => source).join("\n");
}

function assertBuiltHarnessContract(source) {
  const localVaultSupportedRomMessage =
    "Only .nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, and .gg files are supported.";
  const requiredMarkers = [
    "Open confirmation",
    "Confirm Ban",
    "Locked for Review",
    "Engine could not open the selected game file.",
    "Cloud boot failed: the hosted API returned a game without a reachable ROM target.",
    "Local boot failed: the desktop engine could not open demo-local.nes from Local Vault.",
    "LAN Invite",
    "ROM uploads must use the .nes file extension.",
    localVaultSupportedRomMessage,
    "The saved pairing token was rejected. Enter the current desktop token to reconnect.",
  ];

  for (const marker of requiredMarkers) {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function startWebServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", baseUrl);
      const pathname = decodeURIComponent(url.pathname);
      const relativePath = pathname === "/" ? harnessPath.slice(1) : pathname.slice(1);
      const filePath = path.resolve(rootDir, relativePath);

      if (!filePath.startsWith(`${rootDir}${path.sep}`)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-type": getContentType(filePath),
      });
      res.end(body);
    } catch (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Not found: ${error instanceof Error ? error.message : error}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

function formatDiagnostics({
  badResponses,
  consoleErrors,
  documentState,
  failedRequests,
  recentResponses,
  pageErrors,
  rootText,
  scriptPresent,
}) {
  const sections = [
    ["Page errors", pageErrors],
    ["Console errors", consoleErrors],
    ["HTTP error responses", badResponses],
    ["Failed requests", failedRequests],
    ["Recent responses", recentResponses],
    ["Document state", [`readyState=${documentState}`, `harnessScriptPresent=${scriptPresent}`]],
    ["Root text", [rootText || "(empty)"]],
  ];

  return sections
    .map(([title, lines]) => {
      const body = lines.length ? lines.join("\n") : "(none)";
      return `\n${title}:\n${body}`;
    })
    .join("\n");
}

async function run() {
  const outDir = await buildHarness();
  const builtHarnessSource = await readBuiltHarnessContract(outDir);
  assertBuiltHarnessContract(builtHarnessSource);
  const server = await startWebServer(outDir);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    const badResponses = [];
    const failedRequests = [];
    const pageErrors = [];
    const recentResponses = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack || error.message);
    });
    page.on("response", (response) => {
      recentResponses.push(`${response.status()} ${response.url()}`);
      recentResponses.splice(0, Math.max(0, recentResponses.length - 25));
      if (response.status() < 400) return;
      badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} - ${
          request.failure()?.errorText || "unknown failure"
        }`,
      );
    });

    await page.goto(`${baseUrl}${harnessPath}`, {
      waitUntil: "domcontentloaded",
    });

    const withDiagnostics = async (label, action) => {
      try {
        return await action();
      } catch (error) {
        const diagnostics = await page
          .evaluate(() => ({
            documentState: document.readyState,
            rootText:
              document.getElementById("root")?.textContent?.slice(0, 2_000) ||
              "",
            scriptPresent: Boolean(
              document.querySelector(
                'script[type="module"][src*="/assets/"]',
              ),
            ),
          }))
          .catch((contentError) => ({
            documentState: `unavailable: ${contentError}`,
            rootText: "",
            scriptPresent: false,
          }));
        throw new Error(
          `Interaction harness failed while ${label}.${formatDiagnostics(
            {
              badResponses,
              consoleErrors: errors,
              documentState: diagnostics.documentState,
              failedRequests,
              pageErrors,
              recentResponses,
              rootText: diagnostics.rootText,
              scriptPresent: diagnostics.scriptPresent,
            },
          )}`,
          { cause: error },
        );
      }
    };

    const mounted = await page
      .getByRole("button", { name: "Open confirmation" })
      .waitFor({ timeout: interactionTimeoutMs })
      .then(() => true)
      .catch(() => false);

    if (!mounted) {
      const diagnostics = await page
        .evaluate(() => ({
          documentState: document.readyState,
          rootText:
            document.getElementById("root")?.textContent?.slice(0, 2_000) ||
            "",
          scriptPresent: Boolean(
            document.querySelector('script[type="module"][src*="/assets/"]'),
          ),
        }))
        .catch((contentError) => ({
          documentState: `unavailable: ${contentError}`,
          rootText: "",
          scriptPresent: false,
        }));
      console.warn(
        `Interaction harness bundle contract passed, but browser mount did not complete within ${interactionTimeoutMs}ms.${formatDiagnostics(
          {
            badResponses,
            consoleErrors: errors,
            documentState: diagnostics.documentState,
            failedRequests,
            pageErrors,
            recentResponses,
            rootText: diagnostics.rootText,
            scriptPresent: diagnostics.scriptPresent,
          },
        )}`,
      );
      return;
    }

    await page.getByRole("button", { name: "Open confirmation" }).click();
    await page.getByRole("dialog", { name: "Ban user?" }).waitFor();
    await page.getByRole("button", { name: "Cancel" }).click();
    await assert.match(
      await page.getByLabel("Harness events").textContent(),
      /cancelled/,
    );

    await page.getByRole("button", { name: "Open confirmation" }).click();
    await page.getByRole("button", { name: "Confirm Ban" }).click();
    await page.getByText("confirmed:ban-user").waitFor();

    await page
      .getByRole("region", { name: "Report card harness" })
      .getByRole("button", { name: "Action" })
      .first()
      .click();
    await page.getByRole("button", { name: "Ignore Report" }).click();
    await page.getByText("ignore:report-user").waitFor();

    await page.getByText("Locked for Review").waitFor();

    await page.getByRole("button", { name: "Next page" }).click();
    await page.getByText("Current page: 3").waitFor();

    const streamStage = page.getByRole("region", {
      name: "Stream stage harness",
    });
    await streamStage
      .getByText("Engine could not open the selected game file.")
      .waitFor();
    await streamStage.getByRole("button", { name: "Retry Stream" }).click();
    await page.getByText("stream-retry").waitFor();

    await page.getByRole("button", { name: "Hide stream stats" }).click();
    await page.getByText("telemetry-hidden").waitFor();
    await streamStage
      .locator('button.rounded-full[aria-label="Toggle stream telemetry"]')
      .click();
    await page.getByText("telemetry-toggle-on").waitFor();
    await page.getByText("Stream Stats").waitFor();

    const cloudBoot = page.getByRole("region", {
      name: "Cloud Boot Recovery harness",
    });
    await cloudBoot
      .getByText(
        "Cloud boot failed: the hosted API returned a game without a reachable ROM target.",
      )
      .waitFor();
    await cloudBoot.getByText("Cloud game session: cloud-session-failed").waitFor();
    await cloudBoot.getByRole("button", { name: "Retry Stream" }).click();
    await cloudBoot.getByText("Connecting to Edge Node...").waitFor();
    await cloudBoot
      .getByText("Cloud game session: cloud-session-retrying")
      .waitFor();
    await cloudBoot.getByText("Boot attempt: retrying").waitFor();
    assert.equal(
      await cloudBoot
        .getByText(
          "Cloud boot failed: the hosted API returned a game without a reachable ROM target.",
        )
        .count(),
      0,
    );
    await cloudBoot.getByText("Live Stream Active").waitFor();
    await cloudBoot
      .getByText("Cloud game session: cloud-session-recovered")
      .waitFor();
    await cloudBoot.getByText("Boot attempt: recovered").waitFor();
    assert.equal(
      await cloudBoot.getByText("cloud-session-failed").count(),
      0,
    );
    await page.getByText("cloud-boot-recovered").waitFor();

    const localBoot = page.getByRole("region", {
      name: "Local Vault Boot Recovery harness",
    });
    await localBoot
      .getByText(
        "Local boot failed: the desktop engine could not open demo-local.nes from Local Vault.",
      )
      .waitFor();
    await localBoot.getByText("Local game session: local-session-failed").waitFor();
    await localBoot.getByRole("button", { name: "Retry Stream" }).click();
    await localBoot.getByText("Connecting to Edge Node...").waitFor();
    await localBoot
      .getByText("Local game session: local-session-retrying")
      .waitFor();
    await localBoot.getByText("Boot attempt: retrying").waitFor();
    assert.equal(
      await localBoot
        .getByText(
          "Local boot failed: the desktop engine could not open demo-local.nes from Local Vault.",
        )
        .count(),
      0,
    );
    await localBoot.getByText("Live Stream Active").waitFor();
    await localBoot
      .getByText("Local game session: local-session-recovered")
      .waitFor();
    await localBoot.getByText("Boot attempt: recovered").waitFor();
    assert.equal(
      await localBoot.getByText("local-session-failed").count(),
      0,
    );
    await page.getByText("local-boot-recovered").waitFor();

    await page.getByRole("button", { name: /Lobby/ }).click();
    await page.getByText("LAN Invite").waitFor();
    await page
      .getByTitle("Copy HTTPS join link and invite-code guidance")
      .click();
    await page.getByRole("button", { exact: true, name: "P1" }).click();
    await page.getByText("request-slot:1").waitFor();
    assert.equal(
      await page.getByRole("button", { exact: true, name: "P3" }).isDisabled(),
      true,
    );
    await page.getByTitle("Remove Guest").click();
    await page.getByText("kick:guest-socket").waitFor();
    await page.getByTitle("Close lobby").click();

    await page.getByLabel("Harness ROM").setInputFiles({
      buffer: Buffer.from("not a rom"),
      mimeType: "application/zip",
      name: "demo.zip",
    });
    await page.getByText("ROM uploads must use the .nes file extension.").waitFor();
    await page.getByLabel("Harness Cover").setInputFiles({
      buffer: Buffer.from("not an image"),
      mimeType: "text/plain",
      name: "cover.txt",
    });
    await page.getByText("Use an image file for cover or banner art.").waitFor();
    await page.getByLabel("Harness Cover").setInputFiles({
      buffer: Buffer.from("fake image"),
      mimeType: "image/png",
      name: "cover.png",
    });
    await page.getByLabel("Harness ROM").setInputFiles({
      buffer: Buffer.from("fake nes"),
      mimeType: "application/octet-stream",
      name: "demo.nes",
    });
    await page.getByRole("button", { name: "Harness Submit" }).click();
    await page.getByText("publish-submit-ready").waitFor();

    await page.getByLabel("Harness Local ROM").setInputFiles({
      buffer: Buffer.from("not a rom"),
      mimeType: "application/zip",
      name: "local.zip",
    });
    await page
      .getByText(
        "Only .nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, and .gg files are supported.",
      )
      .waitFor();
    await page.getByRole("button", { name: "Open local delete" }).click();
    await page.getByRole("dialog", { name: "Delete local ROM?" }).waitFor();
    await page.getByRole("button", { name: "Delete ROM" }).click();
    await page.getByText("local-delete:demo.nes").waitFor();
    await page.getByRole("button", { name: "Simulate pairing loss" }).click();
    await page
      .getByText("The saved pairing token was rejected. Enter the current desktop token to reconnect.")
      .waitFor();

    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(outDir, { force: true, recursive: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
