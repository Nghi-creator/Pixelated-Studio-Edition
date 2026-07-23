import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STREAM_PROFILE,
  getStreamProfile,
  STREAM_PROFILES,
} from "../../../src/lib/engine/streamProfiles.ts";

test("stream profiles reserve more bandwidth for sharper presets", () => {
  const performance = getStreamProfile("performance");
  const balanced = getStreamProfile("balanced");
  const quality = getStreamProfile("quality");

  assert.equal(performance.bitrateKbps, 700);
  assert.equal(balanced.bitrateKbps, 1400);
  assert.equal(quality.bitrateKbps, 2500);
  assert.ok(performance.bitrateKbps < balanced.bitrateKbps);
  assert.ok(balanced.bitrateKbps < quality.bitrateKbps);
});

test("balanced remains the default stream profile", () => {
  assert.equal(DEFAULT_STREAM_PROFILE.id, "balanced");
  assert.equal(getStreamProfile("unknown").id, "balanced");
  assert.equal(STREAM_PROFILES.length, 3);
});
