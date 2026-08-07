import { getSupportedSubmissionRomExtension } from "../domain/submissionRom.js";

export type GameSubmissionInput = {
  assetLicenseSpdx?: string | null;
  attributionText: string;
  authorName: string;
  bannerUrl?: string | null;
  codeLicenseSpdx?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  email: string;
  gameTitle: string;
  hostingConfirmed: true;
  hostingPermission: "creator_permission" | "license_allows";
  licenseUrl?: string | null;
  noReleaseUrlExplanation?: string | null;
  originalReleaseUrl?: string | null;
  ownershipConfirmed: true;
  ownershipStatus: "creator" | "permission" | "public_project" | "other";
  permissionEvidenceUrl?: string | null;
  publicLicenseScope: "none_owned" | "code" | "assets" | "everything" | "not_sure";
  rightsConfirmed: true;
  rightsNotes?: string | null;
  romUrl: string;
  sourceRepoUrl?: string | null;
  thirdPartyContent: "no" | "yes" | "not_sure";
};

export function createGameSubmissionUseCase(dependencies: {
  countRecent(userId: string, createdAfter: string): Promise<number>;
  findRole(userId: string): Promise<string>;
  insert(values: Record<string, unknown>): Promise<string>;
  isOwnedStorageUrl(url: string, userId: string): boolean;
  now(): number;
  notify(submission: GameSubmissionInput): Promise<void>;
  signUrl(url: string | null | undefined): Promise<string | null>;
}) {
  return async function createGameSubmission(input: {
    submission: GameSubmissionInput;
    userId: string;
  }) {
    const role = await dependencies.findRole(input.userId);
    if (role === "super_admin") return { status: "role_forbidden" } as const;

    const submission = input.submission;
    const pathname = new URL(submission.romUrl).pathname;
    if (!getSupportedSubmissionRomExtension(pathname)) {
      return { status: "unsupported_rom" } as const;
    }
    const urls = [submission.romUrl, submission.coverUrl, submission.bannerUrl].filter(
      (url): url is string => Boolean(url),
    );
    if (!urls.every((url) => dependencies.isOwnedStorageUrl(url, input.userId))) {
      return { status: "unowned_files" } as const;
    }

    const createdAfter = new Date(dependencies.now() - 60 * 60 * 1000).toISOString();
    if ((await dependencies.countRecent(input.userId, createdAfter)) >= 3) {
      return { status: "rate_limited" } as const;
    }

    const id = await dependencies.insert({
      asset_license_spdx: submission.assetLicenseSpdx || null,
      attribution_text: submission.attributionText,
      author_name: submission.authorName,
      banner_url: submission.bannerUrl || null,
      code_license_spdx: submission.codeLicenseSpdx || null,
      cover_url: submission.coverUrl || null,
      description: submission.description || null,
      email: submission.email,
      game_title: submission.gameTitle,
      hosting_confirmed: submission.hostingConfirmed,
      hosting_permission: submission.hostingPermission,
      license_url: submission.licenseUrl || null,
      no_release_url_explanation: submission.noReleaseUrlExplanation || null,
      original_release_url: submission.originalReleaseUrl || null,
      ownership_confirmed: submission.ownershipConfirmed,
      ownership_status: submission.ownershipStatus,
      permission_evidence_url: submission.permissionEvidenceUrl || null,
      public_license_scope: submission.publicLicenseScope,
      rights_confirmed: submission.rightsConfirmed,
      rights_notes: submission.rightsNotes || null,
      rom_url: submission.romUrl,
      source_repo_url: submission.sourceRepoUrl || null,
      submitter_id: input.userId,
      third_party_content: submission.thirdPartyContent,
    });

    let notificationError: unknown;
    try {
      const [romUrl, coverUrl, bannerUrl] = await Promise.all([
        dependencies.signUrl(submission.romUrl),
        dependencies.signUrl(submission.coverUrl),
        dependencies.signUrl(submission.bannerUrl),
      ]);
      await dependencies.notify({
        ...submission,
        bannerUrl,
        coverUrl,
        romUrl: romUrl || submission.romUrl,
      });
    } catch (error) {
      notificationError = error;
    }
    return { id, notificationError, status: "created" } as const;
  };
}
