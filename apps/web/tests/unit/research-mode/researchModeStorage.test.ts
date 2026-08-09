import assert from "node:assert/strict";
import test from "node:test";
import {
  isResearchRoute,
  readResearchMode,
  RESEARCH_MODE_STORAGE_KEY,
  writeResearchMode,
} from "../../../src/features/research-mode/researchModeStorage.ts";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

test("research mode is disabled by default and accepts only its explicit marker", () => {
  assert.equal(readResearchMode(createStorage(), "/home"), false);
  assert.equal(
    readResearchMode(
      createStorage({ [RESEARCH_MODE_STORAGE_KEY]: "true" }),
      "/home",
    ),
    false,
  );
  assert.equal(
    readResearchMode(
      createStorage({ [RESEARCH_MODE_STORAGE_KEY]: "1" }),
      "/home",
    ),
    true,
  );
});

test("research routes imply research mode across direct loads and refreshes", () => {
  assert.equal(isResearchRoute("/research/games/game-1/setup"), true);
  assert.equal(isResearchRoute("/research/play/game-1"), true);
  assert.equal(isResearchRoute("/researcher"), false);
  assert.equal(readResearchMode(createStorage(), "/research/play/game-1"), true);
});

test("research mode persistence is session-scoped and removable", () => {
  const storage = createStorage();
  writeResearchMode(storage, true);
  assert.equal(storage.values.get(RESEARCH_MODE_STORAGE_KEY), "1");
  assert.equal(readResearchMode(storage, "/home"), true);

  writeResearchMode(storage, false);
  assert.equal(storage.values.has(RESEARCH_MODE_STORAGE_KEY), false);
  assert.equal(readResearchMode(storage, "/home"), false);
});

test("research mode fails closed when browser storage is unavailable", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("storage disabled");
    },
    removeItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("storage disabled");
    },
  };

  assert.equal(readResearchMode(unavailableStorage, "/home"), false);
  assert.doesNotThrow(() => writeResearchMode(unavailableStorage, true));
});

