import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalGameTitle,
  getLocalVaultErrorMessage,
  InvalidEngineTokenError,
  normalizeLocalGameFilenames,
  toLocalVaultGames,
  validateLocalRomFile,
} from "../src/features/local-vault/localVaultState.ts";

function fileLike(name: string, size: number) {
  return { name, size } as File;
}

test("local vault ROM validation rejects missing, non-NES, and oversized files", () => {
  assert.equal(validateLocalRomFile(null), "Choose a .nes ROM file first.");
  assert.equal(
    validateLocalRomFile(fileLike("demo.zip", 100)),
    "Only .nes files are supported.",
  );
  assert.equal(
    validateLocalRomFile(fileLike("demo.nes", 9 * 1024 * 1024)),
    "ROM files must be 8 MB or smaller.",
  );
  assert.equal(validateLocalRomFile(fileLike("demo.NES", 100)), null);
});

test("local vault filenames normalize to playable local game cards", () => {
  const filenames = normalizeLocalGameFilenames([
    "new-game.nes",
    "notes.txt",
    null,
    "OLDER.NES",
  ]);

  assert.deepEqual(filenames, ["new-game.nes", "OLDER.NES"]);
  assert.equal(getLocalGameTitle("new-game.nes"), "new-game");
  assert.deepEqual(toLocalVaultGames(filenames), [
    { id: "new-game.nes", title: "new-game" },
    { id: "OLDER.NES", title: "OLDER" },
  ]);
});

test("local vault errors preserve invalid-token recovery guidance", () => {
  assert.equal(
    getLocalVaultErrorMessage(new InvalidEngineTokenError(), "fallback"),
    "The saved pairing token was rejected. Enter the current desktop token to reconnect.",
  );
  assert.equal(
    getLocalVaultErrorMessage(new Error("Engine offline"), "fallback"),
    "Engine offline",
  );
});
