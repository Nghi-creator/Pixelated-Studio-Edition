import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

type ExtraResource = {
  from: string;
  to: string;
  filter?: string[];
};

type DesktopPackageJson = {
  build: {
    asar: boolean;
    directories?: {
      output?: string;
    };
    extraResources?: ExtraResource[];
    files?: string[];
    mac?: {
      icon?: string;
    };
  };
  dependencies?: Record<string, string>;
};

function readPackageJson(): DesktopPackageJson {
  const packageJsonPath = path.resolve(__dirname, "../../package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

describe("desktop package config", () => {
  it("keeps release artifacts outside the TypeScript output folder", () => {
    const packageJson = readPackageJson();

    assert.equal(packageJson.build.directories?.output, "release");
    assert.ok(packageJson.build.files?.includes("!release/**"));
    assert.ok(packageJson.build.files?.includes("!dist/**/*.test.js"));
    assert.ok(packageJson.build.files?.includes("!dist/scripts/**"));
    assert.ok(packageJson.build.files?.includes("!dist/mac{,/**/*}"));
    assert.ok(packageJson.build.files?.includes("!dist/mac-arm64{,/**/*}"));
  });

  it("archives app code while keeping runtime resources readable", () => {
    const packageJson = readPackageJson();
    const resources = packageJson.build.extraResources || [];
    const webResource = resources.find((resource) => resource.to === "web-dist");
    const engineResource = resources.find(
      (resource) => resource.to === "engine-runtime",
    );

    assert.equal(packageJson.build.asar, true);
    assert.equal(webResource?.from, "../web/dist");
    assert.equal(engineResource?.from, "../../engine/runtime");
    assert.ok(engineResource?.filter?.includes("!node_modules/**"));
    assert.ok(engineResource?.filter?.includes("!dist/**"));
    assert.ok(engineResource?.filter?.includes("!**/*.pyc"));
  });

  it("uses the project icon asset for macOS packaging", () => {
    const packageJson = readPackageJson();

    assert.equal(packageJson.build.mac?.icon, "build/icon.png");
  });

  it("ships the QR encoder used by the preload bridge", () => {
    const packageJson = readPackageJson();

    assert.equal(packageJson.dependencies?.qrcode, "^1.5.4");
  });

  it("keeps packaged preload sandbox-safe and renderer scripts browser-safe", () => {
    const preloadPath = path.resolve(__dirname, "../preload.js");
    const rendererPath = path.resolve(__dirname, "../renderer.js");
    const rendererHelperPath = path.resolve(__dirname, "../renderer/logs.js");
    const preload = fs.readFileSync(preloadPath, "utf8");
    const renderer = fs.readFileSync(rendererPath, "utf8");
    const rendererHelper = fs.readFileSync(rendererHelperPath, "utf8");

    assert.doesNotMatch(preload, /require\("\.\/main\/companionQr"\)/);
    assert.match(preload, /ipcRenderer\.invoke|electron_1\.ipcRenderer\.invoke/);
    assert.doesNotMatch(renderer, /\bexports\b/);
    assert.doesNotMatch(rendererHelper, /\bexports\b/);
  });
});
