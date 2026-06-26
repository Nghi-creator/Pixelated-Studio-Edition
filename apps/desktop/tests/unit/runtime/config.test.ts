import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEngineRuntimeKind,
  shouldPullEngineImage,
} from "../../../main/runtime/config";

test("engine runtime kind defaults to libretro unless native is explicitly selected", () => {
  assert.equal(normalizeEngineRuntimeKind(undefined), "libretro");
  assert.equal(normalizeEngineRuntimeKind(""), "libretro");
  assert.equal(normalizeEngineRuntimeKind("native"), "libretro");
  assert.equal(normalizeEngineRuntimeKind("native_linux"), "native_linux");
});

test("engine image pull defaults compare against the selected runtime default image", () => {
  assert.equal(
    shouldPullEngineImage({
      defaultImage: "pixelated-engine",
      image: "pixelated-engine",
    }),
    false,
  );
  assert.equal(
    shouldPullEngineImage({
      defaultImage: "pixelated-engine-native:debian-native-v1-abc",
      image: "pixelated-engine-native:debian-native-v1-abc",
    }),
    false,
  );
  assert.equal(
    shouldPullEngineImage({
      defaultImage: "pixelated-engine",
      image: "ghcr.io/example/pixelated-engine:latest",
    }),
    true,
  );
  assert.equal(
    shouldPullEngineImage({
      defaultImage: "pixelated-engine",
      image: "ghcr.io/example/pixelated-engine:latest",
      pullSetting: "0",
    }),
    false,
  );
  assert.equal(
    shouldPullEngineImage({
      defaultImage: "pixelated-engine",
      image: "pixelated-engine",
      pullSetting: "1",
    }),
    true,
  );
});
