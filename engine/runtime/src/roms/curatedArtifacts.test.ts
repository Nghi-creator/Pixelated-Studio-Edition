import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { validateGameArtifact } from "./artifactValidation";

type SmokeCatalogEntry = {
  artifactFilename: string;
  artifactSha256: string;
  artifactSize: number;
  license: string;
  localMirrorPath: string;
  platformId: "nes" | "gb" | "gbc" | "gba";
  runtimeId: string;
  title: string;
};

type SmokeCatalog = {
  entries: SmokeCatalogEntry[];
};

const fixturePath = path.resolve(
  process.cwd(),
  "../../.context/phase1-libretro-smoke-catalog.json",
);

function readSmokeCatalog(): SmokeCatalog | null {
  if (!fs.existsSync(fixturePath)) return null;
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as SmokeCatalog;
}

test("phase 1 curated smoke catalog covers NES, GB, GBC, and GBA", (t) => {
  const catalog = readSmokeCatalog();
  if (!catalog) {
    t.skip("phase 1 smoke catalog fixture is not available");
    return;
  }

  const formats = new Set(catalog.entries.map((entry) => entry.platformId));
  assert.deepEqual([...formats].sort(), ["gb", "gba", "gbc", "nes"]);
  for (const entry of catalog.entries) {
    assert.match(entry.artifactSha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.artifactSize > 0);
    assert.ok(entry.license.length > 0);
    assert.ok(entry.runtimeId === "mesen" || entry.runtimeId === "mgba");
  }
});

test("phase 1 curated local mirror artifacts match runtime headers and checksums", (t) => {
  const catalog = readSmokeCatalog();
  if (!catalog) {
    t.skip("phase 1 smoke catalog fixture is not available");
    return;
  }

  const missing = catalog.entries.filter(
    (entry) => !fs.existsSync(entry.localMirrorPath),
  );
  if (missing.length > 0) {
    t.skip(
      `local Homebrew Hub mirrors are not available for ${missing
        .map((entry) => entry.title)
        .join(", ")}`,
    );
    return;
  }

  for (const entry of catalog.entries) {
    validateGameArtifact(entry.localMirrorPath, {
      expectedSha256: entry.artifactSha256,
      expectedSizeBytes: entry.artifactSize,
      fileLabel: entry.title,
      runtimeId: entry.runtimeId,
    });
  }
});
