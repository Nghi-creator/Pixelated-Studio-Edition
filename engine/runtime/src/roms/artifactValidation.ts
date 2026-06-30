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

const SEGA_8BIT_HEADER = Buffer.from("TMR SEGA");

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

function readFileWindow(filePath: string, offset: number, length: number) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    return bytesRead === length ? buffer : null;
  } finally {
    fs.closeSync(fd);
  }
}

function bufferStartsWith(buffer: Buffer, prefix: Buffer, offset = 0) {
  if (buffer.length < offset + prefix.length) return false;
  return prefix.every((value, index) => buffer[offset + index] === value);
}

function getSha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
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
    return;
  }

  if (extension === ".sfc" || extension === ".smc") {
    if (!hasValidSnesHeader(filePath)) {
      throw new Error("Invalid SNES cartridge header.");
    }
    return;
  }

  if (extension === ".md" || extension === ".gen") {
    if (!bufferStartsWith(header, Buffer.from("SEGA"), 0x100)) {
      throw new Error("Invalid Genesis/Mega Drive cartridge header.");
    }
    return;
  }

  if (extension === ".sms" || extension === ".gg") {
    if (!hasValidSega8BitHeader(filePath)) {
      throw new Error("Invalid Sega 8-bit cartridge header.");
    }
  }
}

function hasValidSega8BitHeader(filePath: string) {
  const stat = fs.statSync(filePath);
  const headerOffsets = [0x1ff0, 0x3ff0, 0x7ff0];

  return headerOffsets.some((offset) => {
    if (stat.size < offset + SEGA_8BIT_HEADER.length) return false;
    const header = readFileWindow(filePath, offset, SEGA_8BIT_HEADER.length);
    return header ? header.equals(SEGA_8BIT_HEADER) : false;
  });
}

function hasValidSnesHeader(filePath: string) {
  const stat = fs.statSync(filePath);
  const headerOffsets = [0x7fc0, 0xffc0, 0x40ffc0, 0x81c0];

  return headerOffsets.some((offset) => {
    if (stat.size < offset + 0x40) return false;

    const header = readFileWindow(filePath, offset, 0x40);
    if (!header) return false;

    const title = header.subarray(0, 21);
    const printableTitleBytes = title.filter(
      (value) => value === 0x00 || (value >= 0x20 && value <= 0x7e),
    ).length;
    const mapMode = header[0x15];
    const romType = header[0x16];
    const romSize = header[0x17];
    const complement = header.readUInt16LE(0x1c);
    const checksum = header.readUInt16LE(0x1e);

    return (
      printableTitleBytes >= 16 &&
      [0x20, 0x21, 0x25, 0x30, 0x31, 0x35].includes(mapMode) &&
      romType <= 0x35 &&
      romSize <= 0x0d &&
      ((checksum + complement) & 0xffff) === 0xffff
    );
  });
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
