import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateGameArtifact } from "./artifactValidation";

function writeTempRom(filename: string, bytes: Buffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixelated-rom-"));
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("validates NES iNES headers and optional checksum", () => {
  const bytes = Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
  const filePath = writeTempRom("game.nes", bytes);

  validateGameArtifact(filePath, {
    expectedSha256: sha256(bytes),
    expectedSizeBytes: bytes.length,
    runtimeId: "mesen",
  });
});

test("rejects mismatched runtime extensions", () => {
  const bytes = Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
  const filePath = writeTempRom("game.nes", bytes);

  assert.throws(
    () => validateGameArtifact(filePath, { runtimeId: "mgba" }),
    /not supported by mgba/,
  );
});

test("validates GB/GBC and GBA cartridge signatures", () => {
  const gbBytes = Buffer.alloc(0x160);
  Buffer.from([0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b]).copy(
    gbBytes,
    0x104,
  );
  validateGameArtifact(writeTempRom("game.gbc", gbBytes), { runtimeId: "mgba" });

  const gbaBytes = Buffer.alloc(0x160);
  Buffer.from([0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21]).copy(
    gbaBytes,
    0x04,
  );
  validateGameArtifact(writeTempRom("game.gba", gbaBytes), { runtimeId: "mgba" });
});

test("rejects invalid cartridge headers", () => {
  const filePath = writeTempRom("broken.gba", Buffer.alloc(0x160));

  assert.throws(
    () => validateGameArtifact(filePath, { runtimeId: "mgba" }),
    /Invalid GBA cartridge header/,
  );
});
