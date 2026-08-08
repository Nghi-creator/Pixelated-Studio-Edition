import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { computeEngineRuntimeFingerprint } from "../../../main/runtime/fingerprint";

function createRuntimeFixture() {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-fingerprint-"));
  fs.mkdirSync(path.join(runtimeDir, "src"));
  fs.writeFileSync(path.join(runtimeDir, "Dockerfile"), "FROM scratch\n");
  fs.writeFileSync(path.join(runtimeDir, "src", "server.ts"), "export {};\n");
  return runtimeDir;
}

test("engine fingerprints are deterministic and runtime-specific", (t) => {
  const runtimeDir = createRuntimeFixture();
  t.after(() => fs.rmSync(runtimeDir, { force: true, recursive: true }));

  const first = computeEngineRuntimeFingerprint(runtimeDir, "libretro");
  const second = computeEngineRuntimeFingerprint(runtimeDir, "libretro");
  const native = computeEngineRuntimeFingerprint(runtimeDir, "native_linux");

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(second, first);
  assert.notEqual(native, first);
});

test("engine fingerprints change with runtime content but ignore build output", (t) => {
  const runtimeDir = createRuntimeFixture();
  t.after(() => fs.rmSync(runtimeDir, { force: true, recursive: true }));
  const initial = computeEngineRuntimeFingerprint(runtimeDir, "libretro");

  fs.mkdirSync(path.join(runtimeDir, "dist"));
  fs.writeFileSync(path.join(runtimeDir, "dist", "server.js"), "ignored\n");
  assert.equal(computeEngineRuntimeFingerprint(runtimeDir, "libretro"), initial);

  fs.writeFileSync(path.join(runtimeDir, "src", "server.ts"), "export const changed = true;\n");
  assert.notEqual(computeEngineRuntimeFingerprint(runtimeDir, "libretro"), initial);
});

test("engine fingerprints hash symlink destinations without reading their targets", (t) => {
  const runtimeDir = createRuntimeFixture();
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-fingerprint-outside-"));
  t.after(() => fs.rmSync(runtimeDir, { force: true, recursive: true }));
  t.after(() => fs.rmSync(outsideDir, { force: true, recursive: true }));

  const outsideFile = path.join(outsideDir, "outside.txt");
  fs.writeFileSync(outsideFile, "first\n");
  fs.symlinkSync(outsideFile, path.join(runtimeDir, "external-link"));
  const initial = computeEngineRuntimeFingerprint(runtimeDir, "libretro");

  fs.writeFileSync(outsideFile, "changed outside content\n");
  assert.equal(computeEngineRuntimeFingerprint(runtimeDir, "libretro"), initial);
});
