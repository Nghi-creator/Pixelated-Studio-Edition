import type { ApiGameSubmission } from "../../lib/api/apiTypes";

export type SubmissionFormState = {
  assetLicense: string;
  attribution: string;
  codeLicense: string;
  licenseUrl: string;
  notes: string;
  originalReleaseUrl: string;
  permissionEvidenceUrl: string;
  rightsWarnings: string;
  sourceRepoUrl: string;
};

export function getSubmissionArtifactName(url: string) {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : url;
  } catch {
    return url;
  }
}

export function getDefaultSubmissionAttribution(
  submission: Pick<ApiGameSubmission, "author_name" | "game_title">,
) {
  return `${submission.game_title} by ${submission.author_name}. Submitted to Pixelated for non-commercial cloud library review.`;
}

export function getInitialSubmissionFormState(
  submission: ApiGameSubmission,
): SubmissionFormState {
  const rightsWarnings = [
    submission.rights_notes,
    submission.third_party_content && submission.third_party_content !== "no"
      ? `Third-party content: ${submission.third_party_content}`
      : "",
    submission.no_release_url_explanation
      ? `No release URL: ${submission.no_release_url_explanation}`
      : "",
  ].filter(Boolean);

  return {
    assetLicense: submission.asset_license_spdx || "",
    attribution:
      submission.attribution_text || getDefaultSubmissionAttribution(submission),
    codeLicense: submission.code_license_spdx || "",
    licenseUrl: submission.license_url || "",
    notes: "",
    originalReleaseUrl: submission.original_release_url || "",
    permissionEvidenceUrl: submission.permission_evidence_url || "",
    rightsWarnings:
      rightsWarnings.join("\n") ||
      "Confirm submitted ROM, code, art, and audio can be hosted.",
    sourceRepoUrl:
      submission.source_repo_url || submission.original_release_url || "",
  };
}

export function canCreateSubmissionCandidate(form: SubmissionFormState) {
  return Boolean(
    form.attribution.trim() &&
      form.codeLicense.trim() &&
      form.licenseUrl.trim() &&
      form.sourceRepoUrl.trim(),
  );
}

export function parseRightsWarnings(value: string) {
  return value
    .split("\n")
    .map((warning) => warning.trim())
    .filter(Boolean);
}
