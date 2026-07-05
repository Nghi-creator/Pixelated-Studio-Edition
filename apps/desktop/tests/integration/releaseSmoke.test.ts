import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertBrowserScript,
  assertPreloadScript,
  createArchiveEntryMap,
  getHtmlScriptSources,
  normalizeArchiveEntry,
  normalizeArchiveExtractionPath,
} from "../../scripts/releaseSmoke";

describe("desktop packaged release smoke helpers", () => {
  it("reads renderer scripts in packaged HTML order", () => {
    assert.deepEqual(
      getHtmlScriptSources(`
        <script src="./dist/renderer/logs.js"></script>
        <script src="./dist/renderer/recovery.js"></script>
        <script src="./dist/renderer/clients.js"></script>
        <script src="./dist/renderer.js"></script>
      `),
      [
        "dist/renderer/logs.js",
        "dist/renderer/recovery.js",
        "dist/renderer/clients.js",
        "dist/renderer.js",
      ],
    );
  });

  it("normalizes macOS/Linux and Windows asar entry separators", () => {
    assert.equal(normalizeArchiveEntry("/package.json"), "package.json");
    assert.equal(
      normalizeArchiveEntry("\\dist\\main\\docker\\recovery.js"),
      "dist/main/docker/recovery.js",
    );
    assert.equal(normalizeArchiveExtractionPath("/package.json"), "package.json");
    assert.equal(
      normalizeArchiveExtractionPath("\\dist\\renderer\\logs.js"),
      "dist\\renderer\\logs.js",
    );
  });

  it("preserves native Windows asar paths while indexing normalized names", () => {
    const entries = createArchiveEntryMap([
      "\\package.json",
      "\\dist\\renderer\\logs.js",
    ]);

    assert.equal(entries.get("package.json"), "package.json");
    assert.equal(
      entries.get("dist/renderer/logs.js"),
      "dist\\renderer\\logs.js",
    );
  });

  it("rejects the CommonJS renderer output behind the June 6 inert UI regression", () => {
    assert.throws(
      () => assertBrowserScript('"use strict"; Object.defineProperty(exports, "__esModule", { value: true });', "renderer.js"),
      /CommonJS output/,
    );
    assert.doesNotThrow(() =>
      assertBrowserScript('window.PixelatedLogs = { createLogController() {} };', "renderer.js"),
    );
  });

  it("rejects preload-local-module imports and accepts the packaged IPC bridge", () => {
    const apiNames = [
      "createCompanionQrDataUrl",
      "launchWeb",
      "listEngineClients",
      "openDockerResource",
      "buildEngineImage",
      "startDocker",
      "startDockerApplication",
      "cancelDockerRecovery",
      "stopDocker",
      "regenerateLanInvite",
      "revokeEngineClient",
      "revokeLanInvite",
      "rotateEngineToken",
      "onServerLog",
      "onEngineState",
      "onEngineStopped",
      "onEngineToken",
      "onEngineExposure",
      "onEngineCompanion",
      "onDockerDiagnostic",
      "onDockerRecoveryStarted",
      "onDockerRecoveryReady",
      "onDockerRecoveryCancelled",
      "onEngineImageRecovery",
      "onEngineImageBuildStarted",
      "onEngineImageBuildReady",
    ];
    const bridge = `
      const { contextBridge, ipcRenderer } = require("electron");
      contextBridge.exposeInMainWorld("electronAPI", {
        ${apiNames.map((name) => `${name}: () => ipcRenderer.invoke("create-companion-qr")`).join(",")}
      });
    `;

    assert.doesNotThrow(() => assertPreloadScript(bridge, "preload.js"));
    assert.throws(
      () => assertPreloadScript(`${bridge}\nrequire("./main/companion/qr");`, "preload.js"),
      /unsupported sandbox modules/,
    );
  });
});
