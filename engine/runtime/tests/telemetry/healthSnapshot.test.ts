import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createHealthSnapshot,
  createPublicHealthSnapshot,
} from "../../src/telemetry/healthSnapshot";

describe("engine health snapshot", () => {
  it("uses a lightweight public snapshot and caches static readiness", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-health-"));
    const existingFile = path.join(tempDir, "ready");
    const xvfbSocket = path.join(tempDir, "xvfb-socket");
    fs.writeFileSync(existingFile, "");
    fs.writeFileSync(xvfbSocket, "");
    let hostReady = false;
    let now = 1_000;
    const getPublicHealthSnapshot = createPublicHealthSnapshot(
      {
        engineToken: "secret",
        getRuntimeState: () => ({
          pulseAudioProcess: hostReady ? { exitCode: null } : null,
          virtualDisplayProcess: hostReady ? { exitCode: null } : null,
        }),
        healthPaths: {
          cameraBridge: existingFile,
          cameraPeerState: existingFile,
          gamepadBridge: existingFile,
          gstreamerBinary: existingFile,
          libretroCores: [existingFile],
          pythonBinary: existingFile,
          retroarchBinary: existingFile,
          retroarchConfig: existingFile,
          roms: tempDir,
          xvfbSocket,
        },
      },
      { now: () => now, readinessCacheTtlMs: 1_000 },
    );

    assert.equal(getPublicHealthSnapshot().ok, false);
    hostReady = true;
    assert.equal(getPublicHealthSnapshot().ok, true);
    fs.rmSync(existingFile);

    const cachedSnapshot = getPublicHealthSnapshot();
    assert.equal(cachedSnapshot.ok, true);
    assert.equal("checks" in cachedSnapshot, false);
    assert.equal(cachedSnapshot.engineTokenRequired, true);

    now += 1_000;
    assert.equal(getPublicHealthSnapshot().ok, false);
  });

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
        libretroCores: [existingFile],
        pythonBinary: existingFile,
        retroarchBinary: existingFile,
        retroarchConfig: existingFile,
        roms: tempDir,
        xvfbSocket: existingFile,
      },
    });

    const snapshot = getHealthSnapshot();
    assert.equal(snapshot.exposureMode, "lan");
    assert.equal(snapshot.runtimeKind, "libretro");
    assert.deepEqual(snapshot.companionUrls, ["https://192.168.1.20:8090"]);
  });

  it("does not require RetroArch binaries for native Linux runtime health", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-health-"));
    const existingFile = path.join(tempDir, "ready");
    fs.writeFileSync(existingFile, "");

    const getHealthSnapshot = createHealthSnapshot({
      getRuntimeState: () => ({
        pulseAudioProcess: { exitCode: null },
        virtualDisplayProcess: { exitCode: null },
      }),
      healthPaths: {
        cameraBridge: existingFile,
        cameraPeerState: existingFile,
        gamepadBridge: existingFile,
        gstreamerBinary: existingFile,
        libretroCores: [path.join(tempDir, "missing-core")],
        pythonBinary: existingFile,
        retroarchBinary: path.join(tempDir, "missing-retroarch"),
        retroarchConfig: path.join(tempDir, "missing-config"),
        roms: tempDir,
        xvfbSocket: existingFile,
      },
      runtimeKind: "native_linux",
    });

    const snapshot = getHealthSnapshot();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.runtimeKind, "native_linux");
    assert.equal(snapshot.checks.retroarch.binaryExists, false);
  });

  it("includes recent runtime launch diagnostics", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-health-"));
    const existingFile = path.join(tempDir, "ready");
    fs.writeFileSync(existingFile, "");

    const getHealthSnapshot = createHealthSnapshot({
      getRuntimeState: () => ({
        lastLaunchFailure: {
          exitCode: 1,
          label: "Native game frozen-bubble",
          message: "Native game frozen-bubble exited unexpectedly.",
          occurredAt: "2026-07-01T00:00:00.000Z",
          runtimeId: "debian-native-v1",
          sessionId: "session-native",
          stderrTail: "failed to initialize SDL video output\n",
        },
        pulseAudioProcess: { exitCode: null },
        virtualDisplayProcess: { exitCode: null },
      }),
      healthPaths: {
        cameraBridge: existingFile,
        cameraPeerState: existingFile,
        gamepadBridge: existingFile,
        gstreamerBinary: existingFile,
        libretroCores: [existingFile],
        pythonBinary: existingFile,
        retroarchBinary: existingFile,
        retroarchConfig: existingFile,
        roms: tempDir,
        xvfbSocket: existingFile,
      },
      runtimeKind: "native_linux",
    });

    const snapshot = getHealthSnapshot();
    assert.deepEqual(snapshot.checks.runtime.lastLaunchFailure, {
      exitCode: 1,
      label: "Native game frozen-bubble",
      message: "Native game frozen-bubble exited unexpectedly.",
      occurredAt: "2026-07-01T00:00:00.000Z",
      runtimeId: "debian-native-v1",
      sessionId: "session-native",
      stderrTail: "failed to initialize SDL video output\n",
    });
  });
});
