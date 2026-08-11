import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultResearchRunConfig } from "../../../src/features/research-mode/researchRunConfig.ts";
import {
  clearActiveResearchRun,
  readActiveResearchRun,
  writeActiveResearchRun,
} from "../../../src/features/research-mode/researchRunConfigStorage.ts";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  return {
    getItem: () => value,
    removeItem: () => {
      value = null;
    },
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
    value: () => value,
  };
}

test("active research run storage round-trips a game-scoped config", () => {
    const storage = createStorage();
    const config = {
      ...createDefaultResearchRunConfig("game-1"),
      comparisonCaseId: "comparison-1",
    };

  assert.equal(writeActiveResearchRun(storage, config), true);
  assert.deepEqual(readActiveResearchRun(storage, "game-1"), config);
  assert.equal(readActiveResearchRun(storage, "another-game"), null);
});

test("active research run storage fails closed", () => {
  assert.equal(readActiveResearchRun(createStorage("not-json")), null);
  assert.equal(readActiveResearchRun(null), null);
  assert.equal(
    writeActiveResearchRun(null, {
      ...createDefaultResearchRunConfig("game-1"),
      comparisonCaseId: "comparison-1",
    }),
    false,
  );
});

test("active research run storage clears the draft", () => {
  const storage = createStorage("saved");
  clearActiveResearchRun(storage);
  assert.equal(storage.value(), null);
});
