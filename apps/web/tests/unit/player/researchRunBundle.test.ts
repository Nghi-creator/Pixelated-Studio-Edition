import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createResearchRunBundleFilename,
  createResearchRunBundleTar,
} from "../../../src/features/player/research/researchRunBundle.ts";
import {
  RESEARCH_BUNDLE_V1_REQUIRED_FILES,
} from "../../../src/features/player/research/researchBundleManifest.ts";

const v1FixtureDirectory = fileURLToPath(
  new URL("../../fixtures/research-bundle-v1/", import.meta.url),
);

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length)).replace(
    /\0+$/g,
    "",
  );
}

function readOctal(bytes: Uint8Array, start: number, length: number) {
  const text = readAscii(bytes, start, length).trim();
  return Number.parseInt(text, 8);
}

test("research run bundle tar stores text and binary files", () => {
  const archive = createResearchRunBundleTar(
    [
      {
        data: "hello\n",
        name: "run-metadata.json",
      },
      {
        data: new Uint8Array([1, 2, 3]),
        name: "performance-network.png",
      },
    ],
    new Date("2026-07-04T02:03:04.000Z"),
  );

  assert.equal(readAscii(archive, 0, 100), "run-metadata.json");
  assert.equal(readOctal(archive, 124, 12), 6);
  assert.equal(readAscii(archive, 512, 6), "hello\n");

  const secondHeaderOffset = 1024;
  assert.equal(
    readAscii(archive, secondHeaderOffset, 100),
    "performance-network.png",
  );
  assert.equal(readOctal(archive, secondHeaderOffset + 124, 12), 3);
  assert.deepEqual(
    Array.from(archive.slice(secondHeaderOffset + 512, secondHeaderOffset + 515)),
    [1, 2, 3],
  );
});

test("research run bundle tar ends with two empty blocks", () => {
  const archive = createResearchRunBundleTar([
    {
      data: "hello\n",
      name: "run-metadata.json",
    },
  ]);
  const ending = archive.slice(archive.length - 1024);

  assert.equal(ending.every((value) => value === 0), true);
});

test("research run bundle filenames are filesystem-safe tar names", () => {
  assert.equal(
    createResearchRunBundleFilename({
      gameId: "Beat Beast / edge study",
      recordedAt: new Date("2026-07-04T02:03:04.000Z"),
      runId: "edge:run:1",
    }),
    "pixelated-research-bundle-Beat-Beast-edge-study-edge-run-1-2026-07-04T02-03-04-000Z.tar",
  );
});

test("research run bundle entries cannot escape through tar paths", () => {
  const archive = createResearchRunBundleTar([
    { data: "unsafe", name: "../../outside.txt" },
  ]);

  assert.equal(readAscii(archive, 0, 100), "outside.txt");
});

test("research bundle v1 fixture freezes the pre-v2 evidence contract", async () => {
  const fixtureNames = (await readdir(v1FixtureDirectory)).sort();
  const requiredNames = [...RESEARCH_BUNDLE_V1_REQUIRED_FILES].sort();
  assert.deepEqual(fixtureNames, requiredNames);

  const files = await Promise.all(
    fixtureNames.map(async (name) => ({
      data: await readFile(`${v1FixtureDirectory}/${name}`, "utf8"),
      name,
    })),
  );
  const archive = createResearchRunBundleTar(
    files,
    new Date("2026-07-04T02:04:10.000Z"),
  );

  let offset = 0;
  const archivedNames: string[] = [];
  while (offset < archive.length - 1024) {
    const name = readAscii(archive, offset, 100);
    if (!name) break;
    archivedNames.push(name);
    const size = readOctal(archive, offset + 124, 12);
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  assert.deepEqual(archivedNames, fixtureNames);
  const metadata = JSON.parse(
    await readFile(`${v1FixtureDirectory}/run-metadata.json`, "utf8"),
  ) as { schemaVersion?: unknown; shareUrl?: unknown };
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.shareUrl, null);
});
