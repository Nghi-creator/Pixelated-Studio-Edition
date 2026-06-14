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
      const response = await fetch(`${baseUrl}/interaction-tests/adminHarness.html`);
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

async function run() {
  const server = startWebServer();
  let browser;
  try {
    await waitForServer(server);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(`${baseUrl}/interaction-tests/adminHarness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__PIXELATED_INTERACTION_HARNESS_READY__);

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

    await page.getByText("Engine could not open the selected game file.").waitFor();
    await page.getByRole("button", { name: "Retry Stream" }).click();
    await page.getByText("stream-retry").waitFor();

    await page.getByRole("button", { name: "Hide stream stats" }).click();
    await page.getByText("telemetry-hidden").waitFor();
    await page.getByRole("button", { name: "Toggle stream telemetry" }).click();
    await page.getByText("telemetry-toggle-on").waitFor();
    await page.getByText("Stream Stats").waitFor();

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
