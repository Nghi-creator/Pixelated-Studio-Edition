import assert from "node:assert/strict";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createHostedPairingBrowser } from "./hostedPairingBrowser.mjs";

const require = createRequire(import.meta.url);
const { createCompanionCertificate } = require("../../apps/desktop/dist/main/companion/certificate.js");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pixelated-tls-check-"));
const servers = [];
let browser;
try {
  const listen = async (name) => {
    const files = await createCompanionCertificate(path.join(temporary, name));
    const cert = await fs.readFile(files.certPath);
    const server = https.createServer({ cert, key: await fs.readFile(files.keyPath) }, (_req, response) => {
      response.end("local TLS check");
    });
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return { cert, url: `https://localhost:${server.address().port}` };
  };
  const trusted = await listen("owned-companion");
  const unrelated = await listen("untrusted-service");
  // Invalid certificate input must fail before launching a browser.
  await assert.rejects(() => createHostedPairingBrowser({ launch() { assert.fail("must not launch"); } }, "invalid PEM"));
  const session = await createHostedPairingBrowser(chromium, trusted.cert);
  browser = session.browser;
  const { context } = session;
  const page = await context.newPage();
  assert.equal((await page.goto(trusted.url)).status(), 200);
  const untrustedPage = await context.newPage();
  await assert.rejects(untrustedPage.goto(unrelated.url), /ERR_CERT_AUTHORITY_INVALID/);
  await untrustedPage.close();
  await page.goto(trusted.url);
  assert.equal(await page.textContent("body"), "local TLS check");
  console.log("TLS isolation passed: owned key accepted, unrelated self-signed key rejected, owned endpoint still usable.");
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await Promise.all(servers.filter(server => server.listening).map(server => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      })));
    } finally {
      await fs.rm(temporary, { force: true, recursive: true });
    }
  }
}
