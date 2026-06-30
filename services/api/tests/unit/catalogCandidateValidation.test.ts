import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCandidateArtifactHeader,
  assertCandidateRuntimeAllowed,
  CandidateValidationError,
} from "../../src/modules/catalog/ingestion/catalogCandidateValidation.js";

function validNesRom() {
  return Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
}

function validSnesRom() {
  const bytes = Buffer.alloc(0x10000);
  const headerOffset = 0x7fc0;
  Buffer.from("PIXELATED SNES TEST  ").copy(bytes, headerOffset);
  bytes[headerOffset + 0x15] = 0x20;
  bytes[headerOffset + 0x16] = 0x00;
  bytes[headerOffset + 0x17] = 0x09;
  bytes.writeUInt16LE(0xedcb, headerOffset + 0x1c);
  bytes.writeUInt16LE(0x1234, headerOffset + 0x1e);
  return bytes;
}

function validGenesisRom() {
  const bytes = Buffer.alloc(0x200);
  Buffer.from("SEGA MEGA DRIVE").copy(bytes, 0x100);
  return bytes;
}

function validGameGearRom() {
  const bytes = Buffer.alloc(0x8000);
  Buffer.from("TMR SEGA").copy(bytes, 0x7ff0);
  return bytes;
}

test("candidate runtime allowlist accepts reviewed libretro and native combinations", () => {
  assert.doesNotThrow(() =>
    assertCandidateRuntimeAllowed({
      artifact_filename: "nova.nes",
      launch_manifest_id: null,
      platform_id: "nes",
      runtime_id: "mesen",
      runtime_kind: "libretro",
    }),
  );
  assert.doesNotThrow(() =>
    assertCandidateRuntimeAllowed({
      artifact_filename: "gear.gg",
      launch_manifest_id: null,
      platform_id: "game_gear",
      runtime_id: "picodrive",
      runtime_kind: "libretro",
    }),
  );
  assert.doesNotThrow(() =>
    assertCandidateRuntimeAllowed({
      artifact_filename: null,
      launch_manifest_id: "frozen-bubble",
      platform_id: "linux",
      runtime_id: "debian-native-v1",
      runtime_kind: "native_linux",
    }),
  );
});

test("candidate runtime allowlist rejects mismatched runtime/platform/extension", () => {
  assert.throws(
    () =>
      assertCandidateRuntimeAllowed({
        artifact_filename: "drive.md",
        launch_manifest_id: null,
        platform_id: "genesis",
        runtime_id: "bsnes",
        runtime_kind: "libretro",
      }),
    /not allowlisted/,
  );
  assert.throws(
    () =>
      assertCandidateRuntimeAllowed({
        artifact_filename: "drive.sfc",
        launch_manifest_id: null,
        platform_id: "genesis",
        runtime_id: "picodrive",
        runtime_kind: "libretro",
      }),
    /extension .sfc is not allowlisted/,
  );
  assert.throws(
    () =>
      assertCandidateRuntimeAllowed({
        artifact_filename: null,
        launch_manifest_id: "unknown-game",
        platform_id: "linux",
        runtime_id: "debian-native-v1",
        runtime_kind: "native_linux",
      }),
    /not allowlisted/,
  );
});

test("candidate artifact headers validate supported ROM families", () => {
  assert.doesNotThrow(() =>
    assertCandidateArtifactHeader({ artifact_filename: "nova.nes" }, validNesRom()),
  );
  assert.doesNotThrow(() =>
    assertCandidateArtifactHeader({ artifact_filename: "demo.sfc" }, validSnesRom()),
  );
  assert.doesNotThrow(() =>
    assertCandidateArtifactHeader(
      { artifact_filename: "drive.md" },
      validGenesisRom(),
    ),
  );
  assert.doesNotThrow(() =>
    assertCandidateArtifactHeader(
      { artifact_filename: "gear.gg" },
      validGameGearRom(),
    ),
  );
});

test("candidate artifact header failures use review-safe errors", () => {
  assert.throws(
    () =>
      assertCandidateArtifactHeader(
        { artifact_filename: "drive.md" },
        Buffer.alloc(0x200),
      ),
    CandidateValidationError,
  );
});
