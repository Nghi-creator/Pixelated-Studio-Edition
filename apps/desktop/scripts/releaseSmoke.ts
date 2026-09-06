import fs from "fs";
import path from "path";

let extractFile: (archivePath: string, filePath: string) => Buffer;
let listPackage: (
  archivePath: string,
  options: { isPack: boolean },
) => string[];

async function loadAsar() {
  ({ extractFile, listPackage } = await import("@electron/asar"));
}

const RELEASE_DIR = path.resolve(process.cwd(), "release");
export const EXPECTED_RENDERER_SCRIPTS = [
  "dist/renderer/logs.js",
  "dist/renderer/modal.js",
  "dist/renderer/exposure.js",
  "dist/renderer/phases.js",
  "dist/renderer/status.js",
  "dist/renderer/recovery.js",
  "dist/renderer/clients.js",
  "dist/renderer/lifecycle.js",
  "dist/renderer/events.js",
  "dist/renderer.js",
];
const EXPECTED_PRELOAD_API = [
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readArchiveText(
  archivePath: string,
  filePath: string,
  archiveEntryMap?: Map<string, string>,
) {
  const archiveEntry = archiveEntryMap?.get(filePath) || filePath;
  return extractFile(archivePath, archiveEntry).toString("utf8");
}

function normalizeAssetPath(value: string) {
  const [assetPath = ""] = value.split(/[?#]/, 1);
  return assetPath.replace(/^\.?\//, "");
}

export function normalizeArchiveEntry(value: string) {
  return value.replace(/^[\\/]+/, "").replaceAll("\\", "/");
}

export function normalizeArchiveExtractionPath(value: string) {
  return value.replace(/^[\\/]+/, "");
}

export function createArchiveEntryMap(entries: string[]) {
  return new Map(
    entries.map((entry) => [
      normalizeArchiveEntry(entry),
      normalizeArchiveExtractionPath(entry),
    ]),
  );
}

function findFiles(root: string, fileName: string): string[] {
  if (!fs.existsSync(root)) return [];

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return findFiles(entryPath, fileName);
    return entry.isFile() && entry.name === fileName ? [entryPath] : [];
  });
}

export function getHtmlScriptSources(html: string) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi))
    .flatMap((match) => {
      const source = match[1];
      return source ? [normalizeAssetPath(source)] : [];
    })
    .filter((scriptPath) => scriptPath.startsWith("dist/"));
}

export function assertBrowserScript(source: string, filePath: string) {
  assert(source.trim(), `${filePath} is empty.`);
  assert(
    !/\bexports\b|module\.exports|\brequire\s*\(/.test(source),
    `${filePath} contains CommonJS output and will be inert in the sandboxed renderer.`,
  );
}

export function assertPreloadScript(source: string, filePath: string) {
  assert(source.trim(), `${filePath} is empty.`);
  assert(
    /exposeInMainWorld/.test(source),
    `${filePath} does not expose the renderer IPC bridge.`,
  );
  assert(
    /create-companion-qr/.test(source),
    `${filePath} does not invoke the main-process companion QR handler.`,
  );

  const imports = Array.from(source.matchAll(/\brequire\(["']([^"']+)["']\)/g))
    .map((match) => match[1]);
  const unsupportedImports = imports.filter((specifier) => specifier !== "electron");
  assert(
    unsupportedImports.length === 0,
    `${filePath} imports unsupported sandbox modules: ${unsupportedImports.join(", ")}`,
  );

  for (const apiName of EXPECTED_PRELOAD_API) {
    assert(
      source.includes(apiName),
      `${filePath} is missing preload API ${apiName}.`,
    );
  }
}

function assertPackagedApp(archivePath: string) {
  const archiveEntryMap = createArchiveEntryMap(
    listPackage(archivePath, { isPack: false }),
  );
  const archiveEntries = new Set(archiveEntryMap.keys());
  const requiredEntries = [
    "package.json",
    "index.html",
    "dist/main.js",
    "dist/main/docker/diagnostics.js",
    "dist/main/docker/recovery.js",
    "dist/preload.js",
    ...EXPECTED_RENDERER_SCRIPTS,
  ];

  for (const entry of requiredEntries) {
    assert(archiveEntries.has(entry), `${archivePath} is missing ${entry}.`);
  }
  assert(
    !Array.from(archiveEntries).some(
      (entry) => entry.startsWith("dist/tests/") || entry.startsWith("dist/scripts/"),
    ),
    `${archivePath} ships compiled tests or release helper scripts.`,
  );

  const packageJson = JSON.parse(
    readArchiveText(archivePath, "package.json", archiveEntryMap),
  ) as {
    main?: string;
  };
  assert(packageJson.main === "dist/main.js", `${archivePath} has the wrong main entry.`);

  const main = readArchiveText(archivePath, "dist/main.js", archiveEntryMap);
  assert(
    /preload\.js/.test(main) && /\.\.\/index\.html/.test(main),
    `${archivePath} main process does not load the packaged preload and desktop HTML.`,
  );

  const html = readArchiveText(archivePath, "index.html", archiveEntryMap);
  const scriptSources = getHtmlScriptSources(html);
  assert(
    JSON.stringify(scriptSources) === JSON.stringify(EXPECTED_RENDERER_SCRIPTS),
    `${archivePath} index.html renderer scripts do not match the release contract.`,
  );

  for (const rendererPath of scriptSources) {
    assertBrowserScript(
      readArchiveText(archivePath, rendererPath, archiveEntryMap),
      rendererPath,
    );
  }
  assertPreloadScript(
    readArchiveText(archivePath, "dist/preload.js", archiveEntryMap),
    "dist/preload.js",
  );

  const resourcesDir = path.dirname(archivePath);
  assert(
    fs.existsSync(path.join(resourcesDir, "engine-runtime", "Dockerfile")),
    `Packaged engine runtime is missing beside ${archivePath}.`,
  );
  for (const developmentOnlyPath of [
    "README.md",
    "eslint.config.mjs",
    "scripts",
    "tests",
  ]) {
    assert(
      !fs.existsSync(
        path.join(resourcesDir, "engine-runtime", developmentOnlyPath),
      ),
      `Packaged engine runtime includes development-only ${developmentOnlyPath}.`,
    );
  }
}

export async function runReleaseSmoke(releaseDir = RELEASE_DIR) {
  await loadAsar();
  const archives = findFiles(releaseDir, "app.asar");
  assert(
    archives.length > 0,
    `No unpacked packaged app was found under ${releaseDir}. Run electron-builder before the release smoke.`,
  );

  for (const archivePath of archives) {
    assertPackagedApp(archivePath);
    console.log(`Release smoke passed: ${archivePath}`);
  }
}

if (require.main === module) {
  runReleaseSmoke().catch((err) => {
    console.error(`Release smoke failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
