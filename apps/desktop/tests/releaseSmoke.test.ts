import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertBrowserScript,
  assertPreloadScript,
  getHtmlScriptSources,
} from "../scripts/releaseSmoke";

describe("desktop packaged release smoke helpers", () => {
  it("reads renderer scripts in packaged HTML order", () => {
    assert.deepEqual(
      getHtmlScriptSources(`
        <script src="./dist/renderer/logs.js"></script>
        <script src="./dist/renderer.js"></script>
      `),
      ["dist/renderer/logs.js", "dist/renderer.js"],
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
      "startDocker",
      "stopDocker",
      "regenerateLanInvite",
      "revokeLanInvite",
      "onServerLog",
      "onEngineState",
      "onEngineStopped",
      "onEngineToken",
      "onEngineExposure",
      "onEngineCompanion",
      "onDockerDiagnostic",
    ];
    const bridge = `
      const { contextBridge, ipcRenderer } = require("electron");
      contextBridge.exposeInMainWorld("electronAPI", {
        ${apiNames.map((name) => `${name}: () => ipcRenderer.invoke("create-companion-qr")`).join(",")}
      });
    `;

    assert.doesNotThrow(() => assertPreloadScript(bridge, "preload.js"));
    assert.throws(
      () => assertPreloadScript(`${bridge}\nrequire("./main/companionQr");`, "preload.js"),
      /unsupported sandbox modules/,
    );
  });
});
