#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const webRoot = path.join(repoRoot, "apps", "web");
const port = Number(process.env.PIXELATED_WEB_INTERACTION_PORT || 5174);
const baseUrl = `http://127.0.0.1:${port}`;
const harnessPath = "/interaction-tests/adminHarness.html";
const readinessTimeoutMs = Number(
  process.env.PIXELATED_WEB_INTERACTION_READY_TIMEOUT_MS || 10_000,
);

function startWebServer() {
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: webRoot,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  const append = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  return { child, getOutput: () => output };
}

async function waitForServer(processState) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processState.child.exitCode !== null) {
      throw new Error(
        `Vite dev server exited early:\n${processState.getOutput()}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}${harnessPath}`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for Vite:\n${processState.getOutput()}`);
}

async function stopWebServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function formatDiagnostics({
  badResponses,
  consoleErrors,
  failedRequests,
  pageErrors,
  pageSnippet,
  serverOutput,
}) {
  const sections = [
    ["Page errors", pageErrors],
    ["Console errors", consoleErrors],
    ["HTTP error responses", badResponses],
    ["Failed requests", failedRequests],
    ["Vite output", [serverOutput.trim() || "(empty)"]],
    ["Page snippet", [pageSnippet.trim() || "(empty)"]],
  ];

  return sections
    .map(([title, lines]) => {
      const body = lines.length ? lines.join("\n") : "(none)";
      return `\n${title}:\n${body}`;
    })
    .join("\n");
}

async function run() {
  const server = startWebServer();
  let browser;
  try {
    await waitForServer(server);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    const badResponses = [];
    const failedRequests = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack || error.message);
    });
    page.on("response", (response) => {
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
    try {
      await page.waitForFunction(
        () => window.__PIXELATED_INTERACTION_HARNESS_READY__,
        { timeout: readinessTimeoutMs },
      );
    } catch (error) {
      const pageSnippet = await page
        .content()
        .then((content) => content.slice(0, 2_000))
        .catch((contentError) => `Could not read page content: ${contentError}`);
      throw new Error(
        `Interaction harness did not become ready within ${readinessTimeoutMs}ms.${formatDiagnostics(
          {
            badResponses,
            consoleErrors: errors,
            failedRequests,
            pageErrors,
            pageSnippet,
            serverOutput: server.getOutput(),
          },
        )}`,
        { cause: error },
      );
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
      .getByRole("button", { name: "Toggle stream telemetry" })
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
    await page.getByText("Only .nes files are supported.").waitFor();
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
    await stopWebServer(server.child);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
