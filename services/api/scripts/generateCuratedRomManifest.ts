import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createCuratedRomManifestStub,
  type CuratedRomManifestStubOptions,
} from "../src/modules/catalog/ingestion/curatedRomManifestGenerator.js";

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function getRepeatedArgValues(name: string) {
  const values: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === name) {
      const value = process.argv[index + 1];
      if (value) values.push(value);
    }
  });
  return values;
}

function usage() {
  return `Generate a strict curated ROM manifest stub.

Required:
  --artifact-url <https-url>       Playable ROM artifact URL
  --title <title>                  Review/display title
  --code-license-spdx <spdx>       Source/game license
  --license-url <https-url>        License or permission evidence URL
  --manifest-path <path>           Manifest/evidence path used for source identity

Source metadata:
  Pinned GitHub raw/blob artifact URLs infer repoUrl, rawBaseUrl,
  sourceCommit, and sourceEntryPath automatically. Other URLs require:
  --repo-url <https-url>
  --raw-base-url <https-url>
  --source-commit <40-char-sha1>
  --source-entry-path <path>

Optional:
  --artifact-file <path>           Read bytes from a local file instead of fetching
  --artifact-filename <name>       Override filename from artifact URL
  --asset-license-spdx <spdx>
  --attribution-text <text>
  --developer-name <name>
  --developer-url <https-url>
  --original-release-url <https-url>
  --permission-evidence-url <https-url>
  --rights-warning <text>          Repeatable
  --slug <slug>
  --out <path>                     Write JSON to a file instead of stdout

Example:
  npm --prefix services/api run generate:curated-rom-manifest -- \\
    --artifact-url https://raw.githubusercontent.com/owner/repo/<commit>/roms/game.gba \\
    --title "Game" \\
    --code-license-spdx MIT \\
    --license-url https://github.com/owner/repo/blob/<commit>/LICENSE \\
    --manifest-path curation/pixelated-roms.json
`;
}

function requiredArg(name: string) {
  const value = getArgValue(name);
  if (!value) throw new Error(`Missing required argument ${name}.\n\n${usage()}`);
  return value;
}

async function readArtifactBytes(artifactUrl: string) {
  const artifactFile = getArgValue("--artifact-file");
  if (artifactFile) {
    const resolvedPath = path.isAbsolute(artifactFile)
      ? artifactFile
      : path.resolve(process.env.INIT_CWD || process.cwd(), artifactFile);
    return fs.readFileSync(resolvedPath);
  }

  const response = await fetch(artifactUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch artifact: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    process.stdout.write(usage());
    return;
  }

  const artifactUrl = requiredArg("--artifact-url");
  const options: CuratedRomManifestStubOptions = {
    artifactFilename: getArgValue("--artifact-filename"),
    artifactUrl,
    assetLicenseSpdx: getArgValue("--asset-license-spdx"),
    attributionText: getArgValue("--attribution-text"),
    codeLicenseSpdx: requiredArg("--code-license-spdx"),
    developerName: getArgValue("--developer-name"),
    developerUrl: getArgValue("--developer-url"),
    licenseUrl: requiredArg("--license-url"),
    manifestPath: requiredArg("--manifest-path"),
    originalReleaseUrl: getArgValue("--original-release-url"),
    permissionEvidenceUrl: getArgValue("--permission-evidence-url"),
    rawBaseUrl: getArgValue("--raw-base-url"),
    repoUrl: getArgValue("--repo-url"),
    rightsWarnings: getRepeatedArgValues("--rights-warning"),
    slug: getArgValue("--slug"),
    sourceCommit: getArgValue("--source-commit"),
    sourceEntryPath: getArgValue("--source-entry-path"),
    title: requiredArg("--title"),
  };
  if (options.rightsWarnings?.length === 0) {
    delete options.rightsWarnings;
  }

  const manifest = createCuratedRomManifestStub(
    options,
    await readArtifactBytes(artifactUrl),
  );
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const outPath = getArgValue("--out");
  if (!outPath) {
    process.stdout.write(json);
    return;
  }

  const resolvedOutPath = path.isAbsolute(outPath)
    ? outPath
    : path.resolve(process.env.INIT_CWD || process.cwd(), outPath);
  fs.writeFileSync(resolvedOutPath, json);
  process.stdout.write(`Wrote ${resolvedOutPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
