import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createExclusiveArtifactWriteStream } from "../../src/roms/cloudRomDownloader";
import {
  createCloudRomStagingPath,
  removeCloudRomStagingArtifact,
} from "../../src/roms/cloudRomStaging";

test("cloud ROM staging uses private directories and private exclusive files", async () => {
  const testRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "pixelated-staging-test-"),
  );
  const stagingRoot = path.join(testRoot, "cloud");

  try {
    const artifactPath = createCloudRomStagingPath(".nes", stagingRoot);
    const stagingDirectory = path.dirname(artifactPath);

    assert.equal(fs.statSync(stagingRoot).mode & 0o777, 0o700);
    assert.equal(fs.statSync(stagingDirectory).mode & 0o777, 0o700);

    const file = createExclusiveArtifactWriteStream(artifactPath);
    const closed = once(file, "close");
    file.end(Buffer.from([0x4e, 0x45, 0x53, 0x1a]));
    await closed;

    assert.equal(fs.statSync(artifactPath).mode & 0o777, 0o600);
    removeCloudRomStagingArtifact(artifactPath, stagingRoot);
    assert.equal(fs.existsSync(stagingDirectory), false);
  } finally {
    fs.rmSync(testRoot, { force: true, recursive: true });
  }
});

test("cloud ROM staging cleanup refuses paths outside its private root", () => {
  assert.throws(
    () =>
      removeCloudRomStagingArtifact(
        "/roms/unrelated/game.nes",
        "/roms/.cloud",
      ),
    /Refusing to remove/,
  );
});
