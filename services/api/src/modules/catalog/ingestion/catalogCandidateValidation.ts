import path from "node:path";

export type CandidateValidationInput = {
  artifact_filename: string | null;
  launch_manifest_id: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
};

export class CandidateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateValidationError";
  }
}

const LIBRETRO_CANDIDATE_RULES = [
  { extensions: [".nes"], platformId: "nes", runtimeId: "mesen" },
  { extensions: [".gb"], platformId: "gb", runtimeId: "mgba" },
  { extensions: [".gbc"], platformId: "gbc", runtimeId: "mgba" },
  { extensions: [".gba"], platformId: "gba", runtimeId: "mgba" },
  { extensions: [".sfc", ".smc"], platformId: "snes", runtimeId: "bsnes" },
  {
    extensions: [".md", ".gen"],
    platformId: "genesis",
    runtimeId: "picodrive",
  },
  { extensions: [".sms"], platformId: "sms", runtimeId: "picodrive" },
  { extensions: [".gg"], platformId: "game_gear", runtimeId: "picodrive" },
];

const GB_NINTENDO_LOGO_PREFIX = Buffer.from([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
]);
const GBA_NINTENDO_LOGO_PREFIX = Buffer.from([
  0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21,
]);
const SEGA_8BIT_HEADER = Buffer.from("TMR SEGA");

function bufferStartsWith(buffer: Buffer, prefix: Buffer, offset = 0) {
  if (buffer.length < offset + prefix.length) return false;
  return prefix.every((value, index) => buffer[offset + index] === value);
}

export function assertCandidateRuntimeAllowed(
  candidate: CandidateValidationInput,
) {
  if (candidate.runtime_kind === "native_linux") {
    if (
      candidate.runtime_id !== "debian-native-v1" ||
      candidate.platform_id !== "linux" ||
      !candidate.launch_manifest_id
    ) {
      throw new CandidateValidationError(
        "Candidate native runtime/platform is not allowlisted.",
      );
    }
    return;
  }

  if (!candidate.artifact_filename) {
    throw new CandidateValidationError("Candidate is missing an artifact filename.");
  }

  const rule = LIBRETRO_CANDIDATE_RULES.find(
    (entry) =>
      entry.runtimeId === candidate.runtime_id &&
      entry.platformId === candidate.platform_id,
  );
  if (!rule) {
    throw new CandidateValidationError(
      "Candidate libretro runtime/platform is not allowlisted.",
    );
  }

  const extension = path.extname(candidate.artifact_filename).toLowerCase();
  if (!rule.extensions.includes(extension)) {
    throw new CandidateValidationError(
      `Candidate artifact extension ${extension || "(none)"} is not allowlisted for ${candidate.platform_id}/${candidate.runtime_id}.`,
    );
  }
}

function hasValidSnesHeader(bytes: Buffer) {
  const headerOffsets = [0x7fc0, 0xffc0, 0x40ffc0, 0x81c0];

  return headerOffsets.some((offset) => {
    if (bytes.length < offset + 0x40) return false;

    const header = bytes.subarray(offset, offset + 0x40);
    const title = header.subarray(0, 21);
    const printableTitleBytes = title.filter(
      (value) => value === 0x00 || (value >= 0x20 && value <= 0x7e),
    ).length;
    const mapMode = header[0x15] ?? -1;
    const romType = header[0x16] ?? Number.POSITIVE_INFINITY;
    const romSize = header[0x17] ?? Number.POSITIVE_INFINITY;
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

function hasValidSega8BitHeader(bytes: Buffer) {
  return [0x1ff0, 0x3ff0, 0x7ff0].some((offset) =>
    bufferStartsWith(bytes, SEGA_8BIT_HEADER, offset),
  );
}

export function assertCandidateArtifactHeader(
  candidate: Pick<CandidateValidationInput, "artifact_filename">,
  bytes: Buffer,
) {
  const extension = path.extname(candidate.artifact_filename || "").toLowerCase();

  if (extension === ".nes") {
    if (!bufferStartsWith(bytes, Buffer.from([0x4e, 0x45, 0x53, 0x1a]))) {
      throw new CandidateValidationError("Invalid NES ROM header.");
    }
    return;
  }

  if (extension === ".gb" || extension === ".gbc") {
    if (!bufferStartsWith(bytes, GB_NINTENDO_LOGO_PREFIX, 0x104)) {
      throw new CandidateValidationError("Invalid GB/GBC cartridge header.");
    }
    return;
  }

  if (extension === ".gba") {
    if (!bufferStartsWith(bytes, GBA_NINTENDO_LOGO_PREFIX, 0x04)) {
      throw new CandidateValidationError("Invalid GBA cartridge header.");
    }
    return;
  }

  if (extension === ".sfc" || extension === ".smc") {
    if (!hasValidSnesHeader(bytes)) {
      throw new CandidateValidationError("Invalid SNES cartridge header.");
    }
    return;
  }

  if (extension === ".md" || extension === ".gen") {
    if (!bufferStartsWith(bytes, Buffer.from("SEGA"), 0x100)) {
      throw new CandidateValidationError(
        "Invalid Genesis/Mega Drive cartridge header.",
      );
    }
    return;
  }

  if (extension === ".sms" || extension === ".gg") {
    if (!hasValidSega8BitHeader(bytes)) {
      throw new CandidateValidationError("Invalid Sega 8-bit cartridge header.");
    }
  }
}
