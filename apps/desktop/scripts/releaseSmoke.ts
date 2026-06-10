import { extractFile, listPackage } from "@electron/asar";
import fs from "fs";
import path from "path";

const RELEASE_DIR = path.resolve(process.cwd(), "release");
const EXPECTED_RENDERER_SCRIPTS = [
  "dist/renderer/logs.js",
  "dist/renderer/modal.js",
  "dist/renderer/exposure.js",
  "dist/renderer/phases.js",
  "dist/renderer.js",
];
const EXPECTED_PRELOAD_API = [
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
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readArchiveText(archivePath: string, filePath: string) {
  return extractFile(archivePath, filePath).toString("utf8");
}

function normalizeAssetPath(value: string) {
  return value.split(/[?#]/, 1)[0].replace(/^\.?\//, "");
}

function findFiles(root: string, fileName: string): string[] {
  if (!fs.existsSync(root)) return [];

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return findFiles(entryPath, fileName);
    return entry.isFile() && entry.name === fileName ? [entryPath] : [];
  });
}

function listRelativeFiles(root: string, currentDir = root): string[] {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) return listRelativeFiles(root, entryPath);
    return entry.isFile() ? [path.relative(root, entryPath)] : [];
  });
}

export function getHtmlScriptSources(html: string) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi))
    .map((match) => normalizeAssetPath(match[1]))
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

function assertWebDist(resourcesDir: string) {
  const sourceWebDistDir = path.resolve(process.cwd(), "../web/dist");
  const webDistDir = path.join(resourcesDir, "web-dist");
  const indexPath = path.join(webDistDir, "index.html");
  assert(
    fs.existsSync(path.join(sourceWebDistDir, "index.html")),
    `Fresh apps/web/dist build is missing under ${sourceWebDistDir}.`,
  );
  assert(fs.existsSync(indexPath), `Packaged web build is missing ${indexPath}.`);

  const sourceFiles = listRelativeFiles(sourceWebDistDir).sort();
  const packagedFiles = listRelativeFiles(webDistDir).sort();
  assert(
    JSON.stringify(packagedFiles) === JSON.stringify(sourceFiles),
    `Packaged web-dist file list does not match the fresh apps/web/dist build.`,
  );
  for (const relativePath of sourceFiles) {
    assert(
      fs.readFileSync(path.join(webDistDir, relativePath)).equals(
        fs.readFileSync(path.join(sourceWebDistDir, relativePath)),
      ),
      `Packaged web asset is stale or changed: ${relativePath}.`,
    );
  }

  const html = fs.readFileSync(indexPath, "utf8");
  const assetRefs = Array.from(
    html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi),
  )
    .map((match) => normalizeAssetPath(match[1]))
    .filter((assetPath) => assetPath.startsWith("assets/"));

  assert(assetRefs.length > 0, `${indexPath} does not reference production assets.`);
  assert(
    assetRefs.some((assetPath) => assetPath.endsWith(".js")),
    `${indexPath} does not reference a JavaScript bundle.`,
  );
  assert(
    assetRefs.some((assetPath) => assetPath.endsWith(".css")),
    `${indexPath} does not reference a stylesheet bundle.`,
  );

  for (const assetPath of assetRefs) {
    const absolutePath = path.join(webDistDir, assetPath);
    assert(fs.existsSync(absolutePath), `Packaged web asset is missing ${absolutePath}.`);
    assert(fs.statSync(absolutePath).size > 0, `Packaged web asset is empty ${absolutePath}.`);
  }
}

function assertPackagedApp(archivePath: string) {
  const archiveEntries = new Set(
    listPackage(archivePath, { isPack: false }).map((entry) =>
      entry.replace(/^\//, ""),
    ),
  );
  const requiredEntries = [
    "package.json",
    "index.html",
    "dist/main.js",
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

  const packageJson = JSON.parse(readArchiveText(archivePath, "package.json")) as {
    main?: string;
  };
  assert(packageJson.main === "dist/main.js", `${archivePath} has the wrong main entry.`);

  const main = readArchiveText(archivePath, "dist/main.js");
  assert(
    /preload\.js/.test(main) && /\.\.\/index\.html/.test(main),
    `${archivePath} main process does not load the packaged preload and desktop HTML.`,
  );

  const html = readArchiveText(archivePath, "index.html");
  const scriptSources = getHtmlScriptSources(html);
  assert(
    JSON.stringify(scriptSources) === JSON.stringify(EXPECTED_RENDERER_SCRIPTS),
    `${archivePath} index.html renderer scripts do not match the release contract.`,
  );

  for (const rendererPath of scriptSources) {
    assertBrowserScript(readArchiveText(archivePath, rendererPath), rendererPath);
  }
  assertPreloadScript(readArchiveText(archivePath, "dist/preload.js"), "dist/preload.js");

  const resourcesDir = path.dirname(archivePath);
  assertWebDist(resourcesDir);
  assert(
    fs.existsSync(path.join(resourcesDir, "engine-runtime", "Dockerfile")),
    `Packaged engine runtime is missing beside ${archivePath}.`,
  );
}

export function runReleaseSmoke(releaseDir = RELEASE_DIR) {
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
  try {
    runReleaseSmoke();
  } catch (err) {
    console.error(`Release smoke failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
