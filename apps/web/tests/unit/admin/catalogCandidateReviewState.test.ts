import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogCandidateRightsDetails,
  getCatalogCandidateRuntimeDetails,
  getCatalogCandidateWarnings,
} from "../../../src/features/admin/catalogCandidateReviewState.ts";

test("catalog candidate runtime details surface native launch manifest cues", () => {
  const details = getCatalogCandidateRuntimeDetails({
    artifact_filename: null,
    launch_manifest_id: "frozen-bubble",
    package_component: "main",
    package_name: "frozen-bubble",
    package_version: "2.212-13+b1",
    platform_id: "linux",
    runtime_id: "debian-native-v1",
    runtime_kind: "native_linux",
  });

  assert.deepEqual(details, [
    { label: "Runtime", value: "Native Linux (debian-native-v1)" },
    { label: "Platform", value: "linux" },
    { label: "Launch Manifest", tone: "success", value: "frozen-bubble" },
    {
      label: "Debian Package",
      value: "frozen-bubble 2.212-13+b1 main",
    },
  ]);
});

test("catalog candidate rights details surface licenses and warning state", () => {
  const details = getCatalogCandidateRightsDetails({
    asset_license_spdx: "Artistic-2.0",
    code_license_spdx: "Artistic-2.0",
    license_url: "https://example.test/license",
    noncommercial_hosting_allowed: true,
    permission_evidence_url: "https://example.test/evidence",
    rights_warnings: [
      "Preserve upstream attribution.",
      "",
      "Use generated cover art.",
    ],
  });

  assert.deepEqual(details.slice(0, 3), [
    { label: "Code License", tone: "success", value: "Artistic-2.0" },
    { label: "Asset License", tone: "success", value: "Artistic-2.0" },
    {
      label: "Hosting",
      tone: "success",
      value: "Non-commercial hosting allowed",
    },
  ]);
  assert.deepEqual(
    getCatalogCandidateWarnings({
      rights_warnings: [
        "Preserve upstream attribution.",
        "",
        "Use generated cover art.",
      ],
    }),
    ["Preserve upstream attribution.", "Use generated cover art."],
  );
});

test("catalog candidate rights details flag missing hosting permission", () => {
  const details = getCatalogCandidateRightsDetails({
    asset_license_spdx: null,
    code_license_spdx: null,
    license_url: null,
    noncommercial_hosting_allowed: false,
    permission_evidence_url: null,
    rights_warnings: null,
  });

  assert.deepEqual(details, [
    { label: "Code License", tone: "warning", value: "Missing" },
    { label: "Asset License", tone: "warning", value: "Not provided" },
    { label: "Hosting", tone: "danger", value: "Hosting permission missing" },
  ]);
});
