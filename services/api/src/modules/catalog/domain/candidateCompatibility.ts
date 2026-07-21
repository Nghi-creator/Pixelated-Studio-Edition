import {
  getBrowserCoreTarget,
  type BrowserCoreId,
  type BrowserSystemId,
} from "../../auth/domain/browserCoreContract.js";
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
  coreId: BrowserCoreId | null;
  eligible: boolean;
  reason: string | null;
  systemId: BrowserSystemId | null;
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
  const target = getBrowserCoreTarget(candidate.platform_id, candidate.artifact_filename);
  if (!target) {
    return {
      coreId: null,
      eligible: false,
      reason: "This candidate is not supported by an installed User Edition browser core.",
      systemId: null,
    };
  }
  if (!candidate.artifact_url) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate has no downloadable artifact.",
      systemId: target.systemId,
    };
  }
  if (!Number.isSafeInteger(candidate.artifact_size) || (candidate.artifact_size || 0) <= 0) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate is missing a verified artifact size.",
      systemId: target.systemId,
    };
  }
  if ((candidate.artifact_size || 0) > MAX_BROWSER_CANDIDATE_BYTES) {
    return {
      coreId: null,
      eligible: false,
      reason: "The artifact exceeds the 64 MB browser safety limit.",
      systemId: target.systemId,
    };
  }
  if (!/^[a-f0-9]{64}$/i.test(candidate.artifact_sha256 || "")) {
    return {
      coreId: null,
      eligible: false,
      reason: "The candidate is missing a verified SHA-256 checksum.",
      systemId: target.systemId,
    };
  }
  return { ...target, eligible: true, reason: null };
}

export function enrichCandidateCompatibility<T extends BrowserCandidate>(candidate: T) {
  return {
    ...candidate,
    browser_compatibility: getCandidateBrowserCompatibility(candidate),
    technical_compatibility: getCandidateTechnicalCompatibility(candidate),
  };
}
