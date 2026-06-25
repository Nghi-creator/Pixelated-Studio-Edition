import assert from "node:assert/strict";
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
