import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectHomebrewHubCandidates } from "../../src/modules/catalog/ingestion/homebrewHubImporter.js";

function writeFixtureEntry(
  root: string,
  slug: string,
  metadata: Record<string, unknown>,
  files: Record<string, Buffer>,
) {
  const entryDir = path.join(root, "entries", slug);
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(entryDir, "game.json"), JSON.stringify(metadata));
  for (const [filename, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(entryDir, filename), bytes);
  }
}

test("Homebrew Hub importer filters to playable supported files with allowlisted licenses", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-hh-"));
  const entriesDir = path.join(repoRoot, "entries");
  const romBytes = Buffer.from("rom");

  writeFixtureEntry(
    repoRoot,
    "good",
    {
      files: [{ default: true, filename: "good.gb", playable: true }],
      gameLicense: "MIT",
      title: "Good Game",
      website: "https://example.test/good",
    },
    { "good.gb": romBytes },
  );
  writeFixtureEntry(
    repoRoot,
    "bad-license",
    {
      files: [{ default: true, filename: "bad.gb", playable: true }],
      license: "Freeware",
      title: "Bad License",
    },
    { "bad.gb": romBytes },
  );
  writeFixtureEntry(
    repoRoot,
    "unsupported-file",
    {
      files: [{ default: true, filename: "manual.pdf", playable: true }],
      gameLicense: "MIT",
      title: "Manual Only",
    },
    { "manual.pdf": romBytes },
  );
  writeFixtureEntry(
    repoRoot,
    "not-playable",
    {
      files: [{ default: true, filename: "tool.gba", playable: false }],
      gameLicense: "MIT",
      title: "Tool",
    },
    { "tool.gba": romBytes },
  );

  const candidates = collectHomebrewHubCandidates([
    {
      commit: "1111111111111111111111111111111111111111",
      entriesDir,
      rawBaseUrl: "https://raw.githubusercontent.com/example/repo",
      repoUrl: "https://github.com/example/repo",
      sourceKind: "homebrew_hub_gb",
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.title, "Good Game");
  assert.equal(candidates[0]?.platformId, "gb");
  assert.equal(candidates[0]?.runtimeId, "mgba");
  assert.equal(candidates[0]?.codeLicenseSpdx, "MIT");
  assert.equal(candidates[0]?.assetLicenseSpdx, "MIT");
  assert.equal(candidates[0]?.nonCommercialHostingAllowed, true);
  assert.equal(candidates[0]?.permissionEvidenceUrl, "https://opensource.org/license/mit");
  assert.match(candidates[0]?.artifactSha256 || "", /^[a-f0-9]{64}$/);
});

test("Homebrew Hub importer marks generic license fields for reviewer confirmation", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-hh-"));
  const entriesDir = path.join(repoRoot, "entries");

  writeFixtureEntry(
    repoRoot,
    "generic-license",
    {
      files: [{ default: true, filename: "game.nes", playable: true }],
      license: "Zlib",
      title: "Generic License Game",
    },
    { "game.nes": Buffer.from("rom") },
  );

  const candidates = collectHomebrewHubCandidates([
    {
      commit: "2222222222222222222222222222222222222222",
      entriesDir,
      rawBaseUrl: "https://raw.githubusercontent.com/example/nes",
      repoUrl: "https://github.com/example/nes",
      sourceKind: "homebrew_hub_nes",
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.platformId, "nes");
  assert.equal(candidates[0]?.runtimeId, "mesen");
  assert.equal(candidates[0]?.codeLicenseSpdx, "Zlib");
  assert.equal(candidates[0]?.assetLicenseSpdx, null);
  assert.equal(candidates[0]?.nonCommercialHostingAllowed, true);
  assert.deepEqual(candidates[0]?.rightsWarnings, [
    "Entry uses a generic license field; reviewer must confirm it covers complete game assets and ROM redistribution.",
  ]);
});
