import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectCuratedRomCandidates,
  collectCuratedRomCandidateReport,
  readCuratedRomManifest,
} from "../../src/modules/catalog/ingestion/curatedRomManifestImporter.js";

function writeManifest(payload: Record<string, unknown>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-curated-rom-"));
  const manifestPath = path.join(dir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(payload));
  return manifestPath;
}

test("curated ROM manifest importer maps supported entries to runtime review candidates", () => {
  const manifest = readCuratedRomManifest(
    writeManifest({
      entries: [
        {
          artifactFilename: "demo.sfc",
          artifactSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          artifactSize: 65536,
          codeLicenseSpdx: "GPL-3.0-or-later",
          licenseUrl: "https://example.test/license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/demo.sfc",
          title: "Demo SNES",
        },
        {
          artifactFilename: "drive.md",
          artifactSha256:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          artifactSize: 524288,
          codeLicenseSpdx: "MIT",
          licenseUrl: "https://example.test/drive-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/drive.md",
          title: "Drive Demo",
        },
        {
          artifactFilename: "master.sms",
          artifactSha256:
            "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          artifactSize: 131072,
          codeLicenseSpdx: "MIT",
          licenseUrl: "https://example.test/master-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/master.sms",
          title: "Master Demo",
        },
        {
          artifactFilename: "gear.gg",
          artifactSha256:
            "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          artifactSize: 131072,
          codeLicenseSpdx: "MIT",
          licenseUrl: "https://example.test/gear-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/gear.gg",
          title: "Gear Demo",
        },
        {
          artifactFilename: "notes.txt",
          artifactSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          artifactSize: 20,
          codeLicenseSpdx: "MIT",
          licenseUrl: "https://example.test/manual-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/notes.txt",
          title: "Not A ROM",
        },
      ],
      manifestPath: "curated/snes.json",
      rawBaseUrl: "https://raw.githubusercontent.com/example/curated-roms",
      repoUrl: "https://github.com/example/curated-roms",
      sourceCommit: "1111111111111111111111111111111111111111",
    }),
  );

  const candidates = collectCuratedRomCandidates(manifest);

  assert.equal(candidates.length, 4);
  assert.equal(candidates[0]?.sourceKind, "curated_licensed_rom");
  assert.equal(candidates[0]?.platformId, "snes");
  assert.equal(candidates[0]?.runtimeId, "bsnes");
  assert.equal(
    candidates[0]?.artifactUrl,
    "https://raw.githubusercontent.com/example/curated-roms/1111111111111111111111111111111111111111/roms/demo.sfc",
  );
  assert.equal(candidates[0]?.sourceEntryPath, "curated/snes.json#demo.sfc");
  assert.equal(candidates[1]?.platformId, "genesis");
  assert.equal(candidates[1]?.runtimeId, "picodrive");
  assert.equal(
    candidates[1]?.artifactUrl,
    "https://raw.githubusercontent.com/example/curated-roms/1111111111111111111111111111111111111111/roms/drive.md",
  );
  assert.equal(candidates[2]?.platformId, "sms");
  assert.equal(candidates[2]?.runtimeId, "picodrive");
  assert.equal(candidates[3]?.platformId, "game_gear");
  assert.equal(candidates[3]?.runtimeId, "picodrive");
});

test("curated ROM manifest requires pinned repository metadata", () => {
  assert.throws(
    () =>
      readCuratedRomManifest(
        writeManifest({
          entries: [],
          manifestPath: "manifest.json",
          rawBaseUrl: "https://raw.githubusercontent.com/example/repo",
          repoUrl: "https://github.com/example/repo",
          sourceCommit: "main",
        }),
      ),
    /sourceCommit/,
  );
});

test("curated ROM manifest report explains skipped entries", () => {
  const manifest = readCuratedRomManifest(
    writeManifest({
      entries: [
        {
          artifactFilename: "demo.sfc",
          artifactSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          artifactSize: 65536,
          codeLicenseSpdx: "GPL-3.0-or-later",
          licenseUrl: "https://example.test/demo-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/demo.sfc",
          title: "Demo SNES",
        },
        {
          artifactFilename: "fan-game.sfc",
          artifactSha256: "not-a-sha",
          artifactSize: 65536,
          sourceEntryPath: "roms/fan-game.sfc",
          title: "Fan Game",
        },
        {
          artifactFilename: "manual.pdf",
          artifactSha256:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          artifactSize: 100,
          codeLicenseSpdx: "MIT",
          licenseUrl: "https://example.test/manual-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "docs/manual.pdf",
          title: "Manual",
        },
      ],
      manifestPath: "curated/snes.json",
      rawBaseUrl: "https://raw.githubusercontent.com/example/curated-roms",
      repoUrl: "https://github.com/example/curated-roms",
      sourceCommit: "1111111111111111111111111111111111111111",
    }),
  );

  const report = collectCuratedRomCandidateReport(manifest);

  assert.equal(report.candidates.length, 1);
  assert.equal(report.skipped.length, 2);
  assert.deepEqual(report.skipped[0]?.reasons, [
    "missing codeLicenseSpdx",
    "missing licenseUrl",
    "nonCommercialHostingAllowed must be true",
    "artifactSha256 must be 64 lowercase hex characters",
  ]);
  assert.deepEqual(report.skipped[1]?.reasons, [
    "unsupported artifact extension",
  ]);
});

test("curated ROM manifest report applies shared rights validation", () => {
  const manifest = readCuratedRomManifest(
    writeManifest({
      entries: [
        {
          artifactFilename: "demo.nes",
          artifactSha256:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          artifactSize: 40960,
          attributionText: "Demo attribution",
          codeLicenseSpdx: "Proprietary",
          licenseUrl: "https://example.test/demo-license",
          nonCommercialHostingAllowed: true,
          sourceEntryPath: "roms/demo.nes",
          title: "Demo NES",
        },
      ],
      manifestPath: "curated/nes.json",
      rawBaseUrl: "https://raw.githubusercontent.com/example/curated-roms",
      repoUrl: "https://github.com/example/curated-roms",
      sourceCommit: "1111111111111111111111111111111111111111",
    }),
  );

  const report = collectCuratedRomCandidateReport(manifest);

  assert.equal(report.candidates.length, 0);
  assert.deepEqual(report.skipped[0]?.reasons, [
    "Candidate license Proprietary is not allowlisted for hosting.",
  ]);
});

test("phase 5 curated ROM manifest imports the pinned PicoDrive candidate", () => {
  const manifest = readCuratedRomManifest(
    path.resolve(
      process.cwd(),
      "tests/unit/fixtures/curated-roms/phase5-curated-roms.json",
    ),
  );

  const report = collectCuratedRomCandidateReport(manifest);

  assert.deepEqual(report.skipped, []);
  assert.equal(report.candidates.length, 1);
  assert.deepEqual(report.candidates[0], {
    artifactFilename: "scorpion-illuminati.md",
    artifactSha256:
      "14c9d2fa5fcba490f01b14adff6fd43c7ed63805ef68d48f9b599952c280d95d",
    artifactSize: 28120,
    artifactUrl:
      "https://raw.githubusercontent.com/moon-watcher/Scorpion-Illuminati-Core/08728404021f9a34afdbe74d1a22fbfdebc00867/bin/rom.bin",
    assetLicenseSpdx: "Artistic-2.0",
    attributionText:
      "Scorpion Illuminati by moon-watcher. Licensed under Artistic-2.0; source, built ROM, and license evidence are pinned at commit 08728404021f9a34afdbe74d1a22fbfdebc00867.",
    codeLicenseSpdx: "Artistic-2.0",
    developerName: "moon-watcher",
    developerUrl: "https://github.com/moon-watcher",
    licenseUrl:
      "https://github.com/moon-watcher/Scorpion-Illuminati-Core/blob/08728404021f9a34afdbe74d1a22fbfdebc00867/LICENSE.md",
    nonCommercialHostingAllowed: true,
    originalReleaseUrl:
      "https://github.com/moon-watcher/Scorpion-Illuminati-Core",
    permissionEvidenceUrl: null,
    platformId: "genesis",
    rightsWarnings: [
      "README describes the game as open source under the Artistic license; reviewer should preserve LICENSE.md attribution with any publication.",
      "Use generated Pixelated cover art unless upstream art is separately reviewed.",
    ],
    runtimeId: "picodrive",
    sourceCommit: "08728404021f9a34afdbe74d1a22fbfdebc00867",
    sourceEntryPath: "README.md#scorpion-illuminati",
    sourceKind: "curated_licensed_rom",
    sourceMetadata: {
      artifactFilename: "scorpion-illuminati.md",
      artifactSha256:
        "14c9d2fa5fcba490f01b14adff6fd43c7ed63805ef68d48f9b599952c280d95d",
      artifactSize: 28120,
      assetLicenseSpdx: "Artistic-2.0",
      attributionText:
        "Scorpion Illuminati by moon-watcher. Licensed under Artistic-2.0; source, built ROM, and license evidence are pinned at commit 08728404021f9a34afdbe74d1a22fbfdebc00867.",
      codeLicenseSpdx: "Artistic-2.0",
      developerName: "moon-watcher",
      developerUrl: "https://github.com/moon-watcher",
      licenseUrl:
        "https://github.com/moon-watcher/Scorpion-Illuminati-Core/blob/08728404021f9a34afdbe74d1a22fbfdebc00867/LICENSE.md",
      nonCommercialHostingAllowed: true,
      originalReleaseUrl:
        "https://github.com/moon-watcher/Scorpion-Illuminati-Core",
      rightsWarnings: [
        "README describes the game as open source under the Artistic license; reviewer should preserve LICENSE.md attribution with any publication.",
        "Use generated Pixelated cover art unless upstream art is separately reviewed.",
      ],
      slug: "scorpion-illuminati",
      sourceEntryPath: "bin/rom.bin",
      title: "Scorpion Illuminati",
    },
    sourceRepoUrl: "https://github.com/moon-watcher/Scorpion-Illuminati-Core",
    title: "Scorpion Illuminati",
  });
});
