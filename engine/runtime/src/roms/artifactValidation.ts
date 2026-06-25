import crypto from "crypto";
import fs from "fs";
import { getFileExtension, getRuntimeDefinition } from "../runtime/runtimeRegistry";

type ArtifactValidationOptions = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  fileLabel?: string;
  runtimeId: string;
};

const GB_NINTENDO_LOGO_PREFIX = Buffer.from([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
]);

const GBA_NINTENDO_LOGO_PREFIX = Buffer.from([
  0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21,
]);

function readPrefix(filePath: string, length: number) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function bufferStartsWith(buffer: Buffer, prefix: Buffer, offset = 0) {
  if (buffer.length < offset + prefix.length) return false;
  return prefix.every((value, index) => buffer[offset + index] === value);
}

function getSha256(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateHeader(filePath: string, extension: string) {
  const header = readPrefix(filePath, 0x160);

  if (extension === ".nes") {
    if (!bufferStartsWith(header, Buffer.from([0x4e, 0x45, 0x53, 0x1a]))) {
      throw new Error("Invalid NES ROM header.");
    }
    return;
  }

  if (extension === ".gb" || extension === ".gbc") {
    if (!bufferStartsWith(header, GB_NINTENDO_LOGO_PREFIX, 0x104)) {
      throw new Error("Invalid GB/GBC cartridge header.");
    }
    return;
  }

  if (extension === ".gba") {
    if (!bufferStartsWith(header, GBA_NINTENDO_LOGO_PREFIX, 0x04)) {
      throw new Error("Invalid GBA cartridge header.");
    }
  }
}

export function validateGameArtifact(
  filePath: string,
  options: ArtifactValidationOptions,
) {
  const runtime = getRuntimeDefinition(options.runtimeId);
  const label = options.fileLabel || "game artifact";
  if (!runtime) throw new Error(`Unsupported runtime for ${label}.`);

  const extension = getFileExtension(filePath);
  if (!runtime.extensions.includes(extension)) {
    throw new Error(
      `${label} extension ${extension || "(none)"} is not supported by ${runtime.id}.`,
    );
  }

  const stat = fs.statSync(filePath);
  if (stat.size > runtime.maxArtifactBytes) {
    throw new Error(
      `${label} is too large for ${runtime.id}. Max size is ${runtime.maxArtifactBytes} bytes.`,
    );
  }

  if (
    typeof options.expectedSizeBytes === "number" &&
    Number.isFinite(options.expectedSizeBytes) &&
    stat.size !== options.expectedSizeBytes
  ) {
    throw new Error(
      `${label} size mismatch. Expected ${options.expectedSizeBytes} bytes, received ${stat.size} bytes.`,
    );
  }

  validateHeader(filePath, extension);

  const expectedSha256 = options.expectedSha256?.toLowerCase() || "";
  if (expectedSha256) {
    const actualSha256 = getSha256(filePath);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`${label} checksum mismatch.`);
    }
  }
}
