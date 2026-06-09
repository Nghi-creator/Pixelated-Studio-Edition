import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createHealthSnapshot } from "./healthSnapshot";

describe("engine health snapshot", () => {
  it("advertises LAN companion URLs for the player lobby", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-health-"));
    const existingFile = path.join(tempDir, "ready");
    fs.writeFileSync(existingFile, "");

    const getHealthSnapshot = createHealthSnapshot({
      advertisedUrls: ["http://192.168.1.20:8080"],
      companionUrls: ["https://192.168.1.20:8090"],
      exposureMode: "lan",
      getRuntimeState: () => ({
        pulseAudioProcess: { exitCode: null },
        virtualDisplayProcess: { exitCode: null },
      }),
      healthPaths: {
        cameraBridge: existingFile,
        cameraPeerState: existingFile,
        gamepadBridge: existingFile,
        gstreamerBinary: existingFile,
        mesenCore: existingFile,
        pythonBinary: existingFile,
        retroarchBinary: existingFile,
        retroarchConfig: existingFile,
        roms: tempDir,
        xvfbSocket: existingFile,
      },
    });

    const snapshot = getHealthSnapshot();
    assert.equal(snapshot.exposureMode, "lan");
    assert.deepEqual(snapshot.companionUrls, ["https://192.168.1.20:8090"]);
  });
});
