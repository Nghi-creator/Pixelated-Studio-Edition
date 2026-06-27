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
    "Only .nes, .gb, .gbc, .gba, .sfc, .smc, .md, and .gen files are supported.",
  );
  assert.equal(
    validateLocalRomFile(fileLike("demo.gba", 65 * 1024 * 1024)),
    "ROM files must be 64 MB or smaller.",
  );
  assert.equal(validateLocalRomFile(fileLike("demo.NES", 100)), null);
  assert.equal(validateLocalRomFile(fileLike("demo.GBC", 100)), null);
  assert.equal(validateLocalRomFile(fileLike("demo.SFC", 100)), null);
  assert.equal(validateLocalRomFile(fileLike("demo.MD", 100)), null);
});

test("local vault filenames normalize to playable local game cards", () => {
  const filenames = normalizeLocalGameFilenames([
    "new-game.nes",
    "pocket.gbc",
    "advance.gba",
    "super.sfc",
    "headered.smc",
    "drive.md",
    "mega.gen",
    "notes.txt",
    null,
    "OLDER.NES",
  ]);

  assert.deepEqual(filenames, [
    "new-game.nes",
    "pocket.gbc",
    "advance.gba",
    "super.sfc",
    "headered.smc",
    "drive.md",
    "mega.gen",
    "OLDER.NES",
  ]);
  assert.equal(getLocalGameTitle("new-game.nes"), "new-game");
  assert.equal(getLocalGameTitle("pocket.gbc"), "pocket");
  assert.equal(getLocalGameTitle("super.sfc"), "super");
  assert.equal(getLocalGameTitle("drive.md"), "drive");
  assert.deepEqual(toLocalVaultGames(filenames), [
    { id: "new-game.nes", title: "new-game" },
    { id: "pocket.gbc", title: "pocket" },
    { id: "advance.gba", title: "advance" },
    { id: "super.sfc", title: "super" },
    { id: "headered.smc", title: "headered" },
    { id: "drive.md", title: "drive" },
    { id: "mega.gen", title: "mega" },
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
