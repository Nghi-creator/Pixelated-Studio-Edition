import assert from "node:assert/strict";
import test from "node:test";
import {
  createCuratedRomManifestStub,
  inferPinnedGitHubRawArtifact,
} from "../../src/modules/catalog/ingestion/curatedRomManifestGenerator.js";
import {
  collectCuratedRomCandidateReport,
  type CuratedRomManifest,
} from "../../src/modules/catalog/ingestion/curatedRomManifestImporter.js";

function makeNesRom() {
  return Buffer.from([
    0x4e, 0x45, 0x53, 0x1a, 0x01, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ...Array.from({ length: 32 }, (_, index) => index % 256),
  ]);
}

test("curated ROM manifest generator infers pinned GitHub raw metadata", () => {
  assert.deepEqual(
    inferPinnedGitHubRawArtifact(
      "https://raw.githubusercontent.com/example/legal-roms/1111111111111111111111111111111111111111/roms/demo.nes",
    ),
    {
      rawBaseUrl: "https://raw.githubusercontent.com/example/legal-roms",
      repoUrl: "https://github.com/example/legal-roms",
      sourceCommit: "1111111111111111111111111111111111111111",
      sourceEntryPath: "roms/demo.nes",
    },
  );
});

test("curated ROM manifest generator outputs an importable manifest stub", () => {
  const bytes = makeNesRom();
  const manifest = createCuratedRomManifestStub(
    {
      artifactUrl:
        "https://raw.githubusercontent.com/example/legal-roms/1111111111111111111111111111111111111111/roms/demo.nes",
      codeLicenseSpdx: "MIT",
      developerName: "Example Developer",
      licenseUrl:
        "https://github.com/example/legal-roms/blob/1111111111111111111111111111111111111111/LICENSE",
      manifestPath: "curation/pixelated-roms.json",
      title: "Demo NES",
    },
    bytes,
  );

  assert.equal(manifest.repoUrl, "https://github.com/example/legal-roms");
  assert.equal(
    manifest.rawBaseUrl,
    "https://raw.githubusercontent.com/example/legal-roms",
  );
  assert.equal(manifest.sourceCommit, "1111111111111111111111111111111111111111");
  assert.equal(manifest.entries[0].artifactFilename, "demo.nes");
  assert.equal(manifest.entries[0].artifactSize, bytes.byteLength);
  assert.match(manifest.entries[0].artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.entries[0].artifactUrl, undefined);
  assert.equal(manifest.entries[0].nonCommercialHostingAllowed, true);
  assert.equal(manifest.entries[0].sourceEntryPath, "roms/demo.nes");

  const report = collectCuratedRomCandidateReport(manifest as CuratedRomManifest);
  assert.deepEqual(report.skipped, []);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0]?.platformId, "nes");
  assert.equal(report.candidates[0]?.runtimeId, "mesen");
});

test("curated ROM manifest generator requires license evidence", () => {
  assert.throws(
    () =>
      createCuratedRomManifestStub(
        {
          artifactUrl:
            "https://raw.githubusercontent.com/example/legal-roms/1111111111111111111111111111111111111111/roms/demo.nes",
          codeLicenseSpdx: "MIT",
          licenseUrl: "",
          manifestPath: "curation/pixelated-roms.json",
          title: "Demo NES",
        },
        makeNesRom(),
      ),
    /licenseUrl is required/,
  );
});

test("curated ROM manifest generator requires hosting permission", () => {
  assert.throws(
    () =>
      createCuratedRomManifestStub(
        {
          artifactUrl:
            "https://raw.githubusercontent.com/example/legal-roms/1111111111111111111111111111111111111111/roms/demo.nes",
          codeLicenseSpdx: "MIT",
          licenseUrl:
            "https://github.com/example/legal-roms/blob/1111111111111111111111111111111111111111/LICENSE",
          manifestPath: "curation/pixelated-roms.json",
          nonCommercialHostingAllowed: false,
          title: "Demo NES",
        },
        makeNesRom(),
      ),
    /nonCommercialHostingAllowed must be true/,
  );
});

test("curated ROM manifest generator rejects unsupported platforms", () => {
  assert.throws(
    () =>
      createCuratedRomManifestStub(
        {
          artifactUrl:
            "https://raw.githubusercontent.com/example/legal-roms/1111111111111111111111111111111111111111/roms/readme.txt",
          codeLicenseSpdx: "MIT",
          licenseUrl:
            "https://github.com/example/legal-roms/blob/1111111111111111111111111111111111111111/LICENSE",
          manifestPath: "curation/pixelated-roms.json",
          title: "Readme",
        },
        Buffer.from("not a rom"),
      ),
    /Unsupported artifact extension/,
  );
});
