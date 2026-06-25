import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalGameTitle,
  getLocalVaultErrorMessage,
  InvalidEngineTokenError,
  normalizeLocalGameFilenames,
  toLocalVaultGames,
  validateLocalRomFile,
} from "../../../src/features/local-vault/localVaultState.ts";

function fileLike(name: string, size: number) {
  return { name, size } as File;
}

test("local vault ROM validation rejects missing, unsupported, and oversized files", () => {
  assert.equal(validateLocalRomFile(null), "Choose a supported ROM file first.");
  assert.equal(
    validateLocalRomFile(fileLike("demo.zip", 100)),
    "Only .nes, .gb, .gbc, and .gba files are supported.",
  );
  assert.equal(
    validateLocalRomFile(fileLike("demo.gba", 33 * 1024 * 1024)),
    "ROM files must be 32 MB or smaller.",
  );
  assert.equal(validateLocalRomFile(fileLike("demo.NES", 100)), null);
  assert.equal(validateLocalRomFile(fileLike("demo.GBC", 100)), null);
});

test("local vault filenames normalize to playable local game cards", () => {
  const filenames = normalizeLocalGameFilenames([
    "new-game.nes",
    "pocket.gbc",
    "advance.gba",
    "notes.txt",
    null,
    "OLDER.NES",
  ]);

  assert.deepEqual(filenames, [
    "new-game.nes",
    "pocket.gbc",
    "advance.gba",
    "OLDER.NES",
  ]);
  assert.equal(getLocalGameTitle("new-game.nes"), "new-game");
  assert.equal(getLocalGameTitle("pocket.gbc"), "pocket");
  assert.deepEqual(toLocalVaultGames(filenames), [
    { id: "new-game.nes", title: "new-game" },
    { id: "pocket.gbc", title: "pocket" },
    { id: "advance.gba", title: "advance" },
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
