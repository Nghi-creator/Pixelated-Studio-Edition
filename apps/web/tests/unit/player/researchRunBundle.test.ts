import assert from "node:assert/strict";
import test from "node:test";
import {
  createResearchRunBundleFilename,
  createResearchRunBundleTar,
} from "../../../src/features/player/research/researchRunBundle.ts";

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
