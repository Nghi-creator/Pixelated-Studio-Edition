import assert from "node:assert/strict";
import test from "node:test";
import {
  getCandidateBrowserCompatibility,
  getCandidateTechnicalCompatibility,
} from "../../src/modules/catalog/domain/candidateCompatibility.js";

const candidate = {
  artifact_filename: "demo.nes",
  artifact_sha256: "a".repeat(64),
  artifact_size: 24_592,
  artifact_url: "https://raw.githubusercontent.com/example/repo/demo.nes",
  launch_manifest_id: null,
  platform_id: "nes",
  runtime_id: "mesen",
  runtime_kind: "libretro" as const,
};

test("NES candidates map the Studio runtime target to the User Edition browser core", () => {
  assert.deepEqual(getCandidateTechnicalCompatibility(candidate), {
    compatible: true,
    reason: null,
  });
  assert.deepEqual(getCandidateBrowserCompatibility(candidate), {
    coreId: "fceumm",
    eligible: true,
    reason: null,
    systemId: "nes",
  });
});

test("technically valid Studio candidates explain why User Edition cannot run them", () => {
  const snesCandidate = {
    ...candidate,
    artifact_filename: "demo.sfc",
    platform_id: "snes",
    runtime_id: "bsnes",
  };

  assert.equal(getCandidateTechnicalCompatibility(snesCandidate).compatible, true);
  assert.deepEqual(getCandidateBrowserCompatibility(snesCandidate), {
    coreId: null,
    eligible: false,
    reason: "The current User Edition release supports NES candidates only.",
    systemId: null,
  });
});

test("invalid runtime pairs remain technically incompatible", () => {
  const invalidCandidate = { ...candidate, runtime_id: "bsnes" };
  const result = getCandidateTechnicalCompatibility(invalidCandidate);

  assert.equal(result.compatible, false);
  assert.match(result.reason || "", /not allowlisted/);
  assert.equal(getCandidateBrowserCompatibility(invalidCandidate).eligible, false);
});
