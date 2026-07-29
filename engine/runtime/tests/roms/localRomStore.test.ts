import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalRomPath,
  getUserFolderPath,
  getVaultFilePath,
  LOCAL_ROM_ROOT,
  sanitizeUserId,
} from "../../src/roms/localRomStore";

test("Local Vault owner paths remain directly under the ROM root", () => {
  assert.equal(LOCAL_ROM_ROOT, "/roms");
  assert.equal(sanitizeUserId("local_engine"), "local_engine");
  assert.equal(sanitizeUserId("../../etc"), "anonymous");
  assert.equal(getUserFolderPath("local_engine"), "/roms/local_engine");
  assert.equal(getUserFolderPath("../../etc"), "/roms/anonymous");
  assert.throws(
    () => assertLocalRomPath("/etc/passwd"),
    /escapes the configured storage root/,
  );
});

test("Local Vault file paths reject traversal and nested filenames", () => {
  assert.equal(
    getVaultFilePath("/roms/local_engine", "game.nes"),
    "/roms/local_engine/game.nes",
  );
  assert.throws(
    () => getVaultFilePath("/roms/local_engine", "../game.nes"),
    /Invalid Local Vault filename/,
  );
  assert.throws(
    () => getVaultFilePath("/roms/local_engine", "nested/game.nes"),
    /Invalid Local Vault filename/,
  );
  assert.throws(
    () => getVaultFilePath("/tmp", "game.nes"),
    /escapes the configured storage root/,
  );
});
