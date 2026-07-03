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
      target?: string;
    };
    linux?: {
      target?: string;
    };
    win?: {
      target?: string;
    };
  };
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function readPackageJson(): DesktopPackageJson {
  const packageJsonPath = path.resolve(__dirname, "../../../package.json");
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

  it("defines native installer targets for every supported desktop OS", () => {
    const packageJson = readPackageJson();

    assert.equal(packageJson.build.mac?.target, "dmg");
    assert.equal(packageJson.build.win?.target, "nsis");
    assert.equal(packageJson.build.linux?.target, "AppImage");
    assert.match(packageJson.scripts?.["dist:ci"] || "", /electron-builder/);
    assert.match(packageJson.scripts?.["dist:ci"] || "", /smoke:release/);
  });

  it("validates native releases on macOS, Windows, and Ubuntu runners", () => {
    const workflowPath = path.resolve(
      __dirname,
      "../../../../../.github/workflows/desktop-release-validation.yml",
    );
    const workflow = fs.readFileSync(workflowPath, "utf8");

    assert.match(workflow, /os: macos-14/);
    assert.match(workflow, /os: windows-latest/);
    assert.match(workflow, /os: ubuntu-latest/);
    assert.match(workflow, /npm run dist:ci --prefix apps\/desktop/);
    assert.match(workflow, /apps\/desktop\/release\/\*\.dmg/);
    assert.match(workflow, /apps\/desktop\/release\/\*\.exe/);
    assert.match(workflow, /apps\/desktop\/release\/\*\.AppImage/);
    assert.match(workflow, /release_tag:/);
    assert.match(workflow, /publish-github-release:/);
    assert.match(workflow, /actions\/download-artifact@v4/);
    assert.match(workflow, /gh release upload "\$RELEASE_TAG" "\$\{assets\[@\]\}" --clobber/);
    assert.match(workflow, /gh "\$\{args\[@\]\}"/);
  });

  it("ships the QR encoder used by the preload bridge", () => {
    const packageJson = readPackageJson();

    assert.equal(packageJson.dependencies?.qrcode, "^1.5.4");
  });

  it("keeps packaged preload sandbox-safe and renderer scripts browser-safe", () => {
    const preloadPath = path.resolve(__dirname, "../../preload.js");
    const rendererPath = path.resolve(__dirname, "../../renderer.js");
    const rendererHelperPath = path.resolve(__dirname, "../../renderer/logs.js");
    const preload = fs.readFileSync(preloadPath, "utf8");
    const renderer = fs.readFileSync(rendererPath, "utf8");
    const rendererHelper = fs.readFileSync(rendererHelperPath, "utf8");

    assert.doesNotMatch(preload, /require\("\.\/main\/companion\/qr"\)/);
    assert.match(preload, /ipcRenderer\.invoke|electron_1\.ipcRenderer\.invoke/);
    assert.doesNotMatch(renderer, /\bexports\b/);
    assert.doesNotMatch(rendererHelper, /\bexports\b/);
    assert.doesNotMatch(rendererHelper, /\.innerHTML\s*[+]?=/);
    assert.match(rendererHelper, /createTextNode/);
  });

  it("ships the image build recovery bridge and renderer action states", () => {
    const preloadPath = path.resolve(__dirname, "../../preload.js");
    const rendererPath = path.resolve(__dirname, "../../renderer.js");
    const preload = fs.readFileSync(preloadPath, "utf8");
    const renderer = fs.readFileSync(rendererPath, "utf8");

    assert.match(preload, /buildEngineImage/);
    assert.match(preload, /build-engine-image/);
    assert.match(preload, /onEngineImageRecovery/);
    assert.match(preload, /engine-image-recovery/);
    assert.match(preload, /onEngineImageBuildStarted/);
    assert.match(preload, /engine-image-build-started/);
    assert.match(preload, /onEngineImageBuildReady/);
    assert.match(preload, /engine-image-build-ready/);

    assert.match(renderer, /createImageRecoveryActionState/);
    assert.match(renderer, /Build image & retry/);
    assert.match(renderer, /Building\.\.\./);
    assert.match(renderer, /setImageRecoveryVisible\(true, payload\)/);
    assert.match(renderer, /setImageBuildPending\(true\)/);
    assert.match(renderer, /setImageRecoveryVisible\(false\)/);
  });

  it("runs the packaged release smoke as part of npm run dist", () => {
    const packageJson = readPackageJson();

    assert.match(packageJson.scripts?.["smoke:release"] || "", /releaseSmoke\.js/);
    assert.match(packageJson.scripts?.dist || "", /npm run smoke:release/);
  });

  it("allows hosted, local development, and companion web origins for the engine", () => {
    const configPath = path.resolve(__dirname, "../../main/runtime/config.js");
    const controllerPath = path.resolve(__dirname, "../../main/engine/controller.js");
    const dockerCommandsPath = path.resolve(__dirname, "../../main/docker/commands.js");
    const engineLaunchPath = path.resolve(__dirname, "../../main/engine/launch.js");
    const config = fs.readFileSync(configPath, "utf8");
    const controller = fs.readFileSync(controllerPath, "utf8");
    const dockerCommands = fs.readFileSync(dockerCommandsPath, "utf8");
    const engineLaunch = fs.readFileSync(engineLaunchPath, "utf8");

    assert.match(config, /https:\/\/pixelated-studio-edition\.vercel\.app/);
    assert.match(config, /PIXELATED_WEB_URL/);
    assert.match(config, /http:\/\/localhost:5173/);
    assert.match(config, /http:\/\/127\.0\.0\.1:5173/);
    assert.match(engineLaunch, /engineAllowedOrigins|engine_allowed_origins/);
    assert.match(controller, /companionUrls|companion_urls/);
    assert.match(dockerCommands, /PIXELATED_COMPANION_URLS/);
    assert.match(dockerCommands, /PIXELATED_ALLOWED_ORIGINS/);
  });

  it("runs Docker through argument arrays instead of shell command strings", () => {
    const dockerPath = path.resolve(__dirname, "../../main/docker/client.js");
    const controllerPath = path.resolve(__dirname, "../../main/engine/controller.js");
    const docker = fs.readFileSync(dockerPath, "utf8");
    const controller = fs.readFileSync(controllerPath, "utf8");

    assert.doesNotMatch(docker, /\bexec\(/);
    assert.doesNotMatch(controller, /\bexec\(/);
    assert.match(docker, /execFile|spawn/);
  });
});
