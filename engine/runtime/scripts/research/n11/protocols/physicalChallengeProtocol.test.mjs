import assert from "node:assert/strict";
import test from "node:test";
import {PHYSICAL_RECIPES, physicalChallengeMode, physicalChallengeSelection} from "./physicalChallengeProtocol.mjs";
import {conditionVariant} from "./conditionProtocol.mjs";
import {runNativeBrowserAcceptance} from "../../n10/browser/nativeBrowserAcceptance.mjs";

test("six exact challenge/control names stay separate from old condition names", () => {
  assert.equal(PHYSICAL_RECIPES.length, 6);
  for (const name of PHYSICAL_RECIPES) {
    assert.equal(physicalChallengeSelection(physicalChallengeMode(name)), name);
    assert.throws(() => conditionVariant(name));
  }
  for (const value of [true, 0, "healthy", "owned_cpu_pressure", "mixed_delay_pressure;anything"]) {
    assert.throws(() => physicalChallengeMode(value));
    assert.equal(physicalChallengeSelection(value), null);
  }
});

test("challenge launcher requires a case ID and rejects unrelated diagnostics before any launch", async () => {
  const image = "sha256:" + "a".repeat(64), mode = physicalChallengeMode("mixed_delay_pressure");
  await assert.rejects(runNativeBrowserAcceptance(image, mode), /explicit paired case required/);
  await assert.rejects(runNativeBrowserAcceptance(image, mode, {resourceTimingDiagnostics: true}), /explicit resource timing/);
});
