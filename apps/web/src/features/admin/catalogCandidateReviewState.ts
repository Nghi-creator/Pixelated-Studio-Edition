import type { ApiCatalogCandidate } from "../../lib/api/apiTypes";

export type CatalogCandidateReviewDetail = {
  label: string;
  tone?: "danger" | "neutral" | "success" | "warning";
  value: string;
};

export function getCatalogCandidateRuntimeDetails(
  candidate: Pick<
    ApiCatalogCandidate,
    | "artifact_filename"
    | "launch_manifest_id"
    | "package_component"
    | "package_name"
    | "package_version"
    | "platform_id"
    | "runtime_id"
    | "runtime_kind"
    | "technical_compatibility"
  >,
): CatalogCandidateReviewDetail[] {
  const details: CatalogCandidateReviewDetail[] = [
    {
      label: "Runtime",
      value:
        candidate.runtime_kind === "native_linux"
          ? `Native Linux (${candidate.runtime_id})`
          : `Libretro (${candidate.runtime_id})`,
    },
    { label: "Platform", value: candidate.platform_id },
    {
      label: "Technical Check",
      tone: candidate.technical_compatibility.compatible ? "success" : "danger",
      value: candidate.technical_compatibility.compatible
        ? "Runtime target allowed"
        : candidate.technical_compatibility.reason || "Incompatible",
    },
  ];

  if (candidate.runtime_kind === "native_linux") {
    details.push({
      label: "Launch Manifest",
      tone: candidate.launch_manifest_id ? "success" : "danger",
      value: candidate.launch_manifest_id || "Missing",
    });
    if (candidate.package_name) {
      details.push({
        label: "Debian Package",
        value: [
          candidate.package_name,
          candidate.package_version,
          candidate.package_component,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    return details;
  }

  details.push({
    label: "ROM Artifact",
    tone: candidate.artifact_filename ? "success" : "danger",
    value: candidate.artifact_filename || "Missing",
  });
  return details;
}

export function getCatalogCandidateRightsDetails(
  candidate: Pick<
    ApiCatalogCandidate,
    | "asset_license_spdx"
    | "code_license_spdx"
    | "license_url"
    | "noncommercial_hosting_allowed"
    | "permission_evidence_url"
    | "rights_warnings"
  >,
): CatalogCandidateReviewDetail[] {
  const details: CatalogCandidateReviewDetail[] = [
    {
      label: "Code License",
      tone: candidate.code_license_spdx ? "success" : "warning",
      value: candidate.code_license_spdx || "Missing",
    },
    {
      label: "Asset License",
      tone: candidate.asset_license_spdx ? "success" : "warning",
      value: candidate.asset_license_spdx || "Not provided",
    },
    {
      label: "Hosting",
      tone:
        candidate.noncommercial_hosting_allowed === true ? "success" : "danger",
      value:
        candidate.noncommercial_hosting_allowed === true
          ? "Non-commercial hosting allowed"
          : "Hosting permission missing",
    },
  ];

  if (candidate.license_url) {
    details.push({ label: "License URL", value: candidate.license_url });
  }
  if (candidate.permission_evidence_url) {
    details.push({
      label: "Permission Evidence",
      value: candidate.permission_evidence_url,
    });
  }

  return details;
}

export function getCatalogCandidateWarnings(
  candidate: Pick<ApiCatalogCandidate, "rights_warnings">,
) {
  return (candidate.rights_warnings || []).filter(
    (warning): warning is string =>
      typeof warning === "string" && warning.trim().length > 0,
  );
}
