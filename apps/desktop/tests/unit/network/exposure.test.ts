import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAdvertisedCompanionUrls,
  getAdvertisedEngineUrls,
  getDockerPublishHost,
  normalizeExposureMode,
} from "../../../main/network/exposure";

describe("desktop exposure helpers", () => {
  it("defaults unknown exposure modes to local", () => {
    assert.equal(normalizeExposureMode(undefined), "local");
    assert.equal(normalizeExposureMode(""), "local");
    assert.equal(normalizeExposureMode("public"), "local");
    assert.equal(normalizeExposureMode("lan"), "lan");
  });

  it("publishes Docker on loopback by default and all interfaces for LAN", () => {
    assert.equal(getDockerPublishHost("local"), "127.0.0.1");
    assert.equal(getDockerPublishHost("lan"), "0.0.0.0");
  });

  it("uses localhost as the advertised local engine URL", () => {
    assert.deepEqual(getAdvertisedEngineUrls("local"), [
      "http://localhost:8080",
    ]);
  });

  it("does not advertise companion URLs outside LAN mode", () => {
    assert.deepEqual(getAdvertisedCompanionUrls("local", 8090), []);
  });
});
