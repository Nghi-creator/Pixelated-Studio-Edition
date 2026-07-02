import path from "node:path";
import {
  readDebianNativeLockManifest,
  type DebianNativeLockManifest,
} from "./debianNativeImporter.js";

export type CandidateValidationInput = {
  artifact_filename: string | null;
  launch_manifest_id: string | null;
  platform_id: string;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
};

export type CandidateRightsValidationInput = {
  asset_license_spdx: string | null;
  attribution_text: string | null;
  code_license_spdx: string | null;
  license_url: string | null;
  noncommercial_hosting_allowed: boolean | null;
  permission_evidence_url: string | null;
  source_commit: string;
  source_entry_path: string;
  source_kind: string;
  source_repo_url: string;
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

let nativeRuntimeLockCache: DebianNativeLockManifest | null | undefined;

const GB_NINTENDO_LOGO_PREFIX = Buffer.from([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b,
]);
const GBA_NINTENDO_LOGO_PREFIX = Buffer.from([
  0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21,
]);
const SEGA_8BIT_HEADER = Buffer.from("TMR SEGA");

const REDISTRIBUTABLE_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "Artistic-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "GPL-2.0-or-later",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
  "Unlicense",
  "WTFPL-2.0",
  "Zlib",
  "Debian-main",
]);

function bufferStartsWith(buffer: Buffer, prefix: Buffer, offset = 0) {
  if (buffer.length < offset + prefix.length) return false;
  return prefix.every((value, index) => buffer[offset + index] === value);
}

export function assertCandidateRuntimeAllowed(
  candidate: CandidateValidationInput,
) {
  if (candidate.runtime_kind === "native_linux") {
    const nativeManifestIds = getNativeRuntimeManifestIds();
    if (
      candidate.runtime_id !== "debian-native-v1" ||
      candidate.platform_id !== "linux" ||
      !candidate.launch_manifest_id ||
      !nativeManifestIds.includes(candidate.launch_manifest_id)
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

function assertHttpsUrl(value: string | null, label: string) {
  if (!value) {
    throw new CandidateValidationError(`${label} is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CandidateValidationError(`${label} must be a valid URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new CandidateValidationError(`${label} must use HTTPS.`);
  }
}

export function assertCandidateRightsEvidence(
  candidate: CandidateRightsValidationInput,
) {
  if (candidate.noncommercial_hosting_allowed !== true) {
    throw new CandidateValidationError(
      "Candidate rights must explicitly allow non-commercial hosting.",
    );
  }

  assertHttpsUrl(candidate.license_url, "Candidate license_url");
  if (candidate.permission_evidence_url) {
    assertHttpsUrl(
      candidate.permission_evidence_url,
      "Candidate permission_evidence_url",
    );
  }

  if (!candidate.attribution_text?.trim()) {
    throw new CandidateValidationError(
      "Candidate rights are missing attribution text.",
    );
  }

  const licenses = [
    candidate.code_license_spdx?.trim(),
    candidate.asset_license_spdx?.trim(),
  ].filter((license): license is string => Boolean(license));
  if (licenses.length === 0 && !candidate.permission_evidence_url) {
    throw new CandidateValidationError(
      "Candidate rights require a license SPDX value or permission evidence.",
    );
  }
  for (const license of licenses) {
    if (!REDISTRIBUTABLE_LICENSES.has(license)) {
      throw new CandidateValidationError(
        `Candidate license ${license} is not allowlisted for hosting.`,
      );
    }
  }

  assertHttpsUrl(candidate.source_repo_url, "Candidate source_repo_url");
  if (candidate.source_kind !== "debian_main_games") {
    if (!/^[a-f0-9]{40}$/.test(candidate.source_commit)) {
      throw new CandidateValidationError(
        "Candidate source_commit must be a 40-character SHA-1.",
      );
    }
    if (!candidate.source_entry_path.trim()) {
      throw new CandidateValidationError(
        "Candidate source_entry_path is required.",
      );
    }
  }
}

function getNativeRuntimeLockPathCandidates() {
  return [
    process.env.PIXELATED_NATIVE_RUNTIME_LOCK_PATH,
    path.resolve(process.cwd(), "../../engine/runtime/native-runtime.lock.json"),
    path.resolve(process.cwd(), "engine/runtime/native-runtime.lock.json"),
  ].filter((entry): entry is string => Boolean(entry));
}

export function readNativeRuntimeLockForValidation() {
  if (nativeRuntimeLockCache !== undefined) return nativeRuntimeLockCache;

  for (const manifestPath of getNativeRuntimeLockPathCandidates()) {
    try {
      nativeRuntimeLockCache = readDebianNativeLockManifest(manifestPath);
      return nativeRuntimeLockCache;
    } catch {
      // Try the next common workspace/deployment location.
    }
  }

  nativeRuntimeLockCache = null;
  return nativeRuntimeLockCache;
}

export function getNativeRuntimeManifestIds() {
  const manifest = readNativeRuntimeLockForValidation();
  return manifest?.packages.map((entry) => entry.manifestId).sort() || [];
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
