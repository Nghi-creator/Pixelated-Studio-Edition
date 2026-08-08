import { env } from "../../../config/env.js";
import type { GameSubmissionInput } from "../application/createGameSubmission.js";

export async function notifyGameSubmission(submission: GameSubmissionInput) {
  if (!env.FORMSPREE_SUBMISSION_URL) return;
  const response = await fetch(env.FORMSPREE_SUBMISSION_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: `New Game Submission: ${submission.gameTitle}`,
      developer: submission.authorName,
      contact_email: submission.email,
      game: submission.gameTitle,
      description: submission.description || "No description provided.",
      rom_download: submission.romUrl,
      cover_art: submission.coverUrl || "None provided",
      banner_art: submission.bannerUrl || "None provided",
      rights: {
        asset_license_spdx: submission.assetLicenseSpdx || null,
        attribution_text: submission.attributionText,
        code_license_spdx: submission.codeLicenseSpdx || null,
        hosting_permission: submission.hostingPermission,
        license_url: submission.licenseUrl || null,
        original_release_url: submission.originalReleaseUrl || null,
        ownership_status: submission.ownershipStatus,
        permission_evidence_url: submission.permissionEvidenceUrl || null,
        public_license_scope: submission.publicLicenseScope,
        rights_notes: submission.rightsNotes || null,
        source_repo_url: submission.sourceRepoUrl || null,
        third_party_content: submission.thirdPartyContent,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Formspree notification failed with ${response.status}`);
}
