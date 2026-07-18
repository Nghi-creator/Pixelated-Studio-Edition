import path from "node:path";
import {
  assertCandidateRuntimeAllowed,
  CandidateValidationError,
  type CandidateValidationInput,
} from "../ingestion/catalogCandidateValidation.js";

export const MAX_BROWSER_CANDIDATE_BYTES = 64 * 1024 * 1024;

type BrowserCandidate = CandidateValidationInput & {
  artifact_sha256: string | null;
  artifact_size: number | null;
  artifact_url: string | null;
};

export type CandidateTechnicalCompatibility = {
  compatible: boolean;
  reason: string | null;
};

export type CandidateBrowserCompatibility = {
  coreId: "fceumm" | null;
  eligible: boolean;
  reason: string | null;
  systemId: "nes" | null;
};

export function getCandidateTechnicalCompatibility(
  candidate: CandidateValidationInput,
): CandidateTechnicalCompatibility {
  try {
    assertCandidateRuntimeAllowed(candidate);
    return { compatible: true, reason: null };
  } catch (error) {
    return {
      compatible: false,
      reason:
        error instanceof CandidateValidationError
          ? error.message
          : "Candidate runtime compatibility could not be verified.",
    };
  }
}

export function getCandidateBrowserCompatibility(
  candidate: BrowserCandidate,
): CandidateBrowserCompatibility {
  const technical = getCandidateTechnicalCompatibility(candidate);
  if (!technical.compatible) {
    return { coreId: null, eligible: false, reason: technical.reason, systemId: null };
  }
  if (candidate.runtime_kind !== "libretro") {
    return {
      coreId: null,
      eligible: false,
      reason: "Native Linux candidates require Studio Edition.",
      systemId: null,
    };
  }
  if (candidate.platform_id !== "nes") {
    return {
      coreId: null,
      eligible: false,
      reason: "The current User Edition release supports NES candidates only.",
      systemId: null,
    };
  }
  if (path.extname(candidate.artifact_filename || "").toLowerCase() !== ".nes") {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate artifact is not an NES ROM.",
      systemId: "nes",
    };
  }
  if (!candidate.artifact_url) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate has no downloadable artifact.",
      systemId: "nes",
    };
  }
  if (!Number.isSafeInteger(candidate.artifact_size) || (candidate.artifact_size || 0) <= 0) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate is missing a verified artifact size.",
      systemId: "nes",
    };
  }
  if ((candidate.artifact_size || 0) > MAX_BROWSER_CANDIDATE_BYTES) {
    return {
      coreId: null,
      eligible: false,
      reason: "The artifact exceeds the 64 MB browser safety limit.",
      systemId: "nes",
    };
  }
  if (!/^[a-f0-9]{64}$/i.test(candidate.artifact_sha256 || "")) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate is missing a verified SHA-256 checksum.",
      systemId: "nes",
    };
  }
  return { coreId: "fceumm", eligible: true, reason: null, systemId: "nes" };
}

export function enrichCandidateCompatibility<T extends BrowserCandidate>(candidate: T) {
  return {
    ...candidate,
    browser_compatibility: getCandidateBrowserCompatibility(candidate),
    technical_compatibility: getCandidateTechnicalCompatibility(candidate),
  };
}
