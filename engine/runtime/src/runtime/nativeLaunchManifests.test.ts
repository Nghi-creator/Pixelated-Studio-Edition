import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getNativeLaunchManifest } from "./nativeLaunchManifests";
import { getRuntimeDefinition } from "./runtimeRegistry";

test("debian native runtime exposes only allowlisted launch manifests", () => {
  const runtime = getRuntimeDefinition("debian-native-v1");

  assert.equal(runtime?.kind, "native_linux");
  assert.deepEqual(runtime?.launchManifestIds, ["frozen-bubble", "neverball"]);
  assert.equal(getNativeLaunchManifest("frozen-bubble")?.executable, "/usr/games/frozen-bubble");
  assert.equal(getNativeLaunchManifest("neverball")?.executable, "/usr/games/neverball");
  assert.equal(getNativeLaunchManifest("/bin/sh"), null);
});

test("native lock manifest matches allowlisted launch manifests and Docker pins", () => {
  const lockPath = path.resolve(__dirname, "../../../native-runtime.lock.json");
  const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile.native");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
    packages: {
      args: string[];
      executable: string;
      manifestId: string;
      packageName: string;
      packageVersion: string;
    }[];
  };
  const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
  const runtime = getRuntimeDefinition("debian-native-v1");

  assert.deepEqual(
    lock.packages.map((pkg) => pkg.manifestId),
    runtime?.launchManifestIds,
  );

  for (const pkg of lock.packages) {
    const manifest = getNativeLaunchManifest(pkg.manifestId);
    assert.equal(manifest?.executable, pkg.executable);
    assert.deepEqual(manifest?.args, pkg.args);
    assert.match(dockerfile, new RegExp(`${pkg.packageName}=${pkg.packageVersion.replaceAll("+", "\\+")}`));
  }
});
