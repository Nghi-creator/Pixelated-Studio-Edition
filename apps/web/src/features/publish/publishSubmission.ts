import type { ApiGameSubmissionPayload } from "../../lib/api/apiTypes";

export const MAX_SUBMISSION_IMAGE_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_SUBMISSION_ROM_EXTENSIONS = [
  ".nes",
  ".gb",
  ".gbc",
  ".gba",
  ".sfc",
  ".smc",
  ".md",
  ".gen",
  ".sms",
  ".gg",
];
export const SUPPORTED_SUBMISSION_ROM_LABEL =
  ".nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, or .gg";

const SUBMISSION_ROM_LIMITS_BY_EXTENSION: Record<string, number> = {
  ".nes": 8 * 1024 * 1024,
  ".gb": 32 * 1024 * 1024,
  ".gbc": 32 * 1024 * 1024,
  ".gba": 32 * 1024 * 1024,
  ".sfc": 64 * 1024 * 1024,
  ".smc": 64 * 1024 * 1024,
  ".md": 16 * 1024 * 1024,
  ".gen": 16 * 1024 * 1024,
  ".sms": 16 * 1024 * 1024,
  ".gg": 16 * 1024 * 1024,
};

export type SubmissionFields = {
  authorName: string;
  assetLicenseSpdx: string;
  attributionText: string;
  codeLicenseSpdx: string;
  description: string;
  email: string;
  gameTitle: string;
  hostingConfirmed: boolean;
  hostingPermission: string;
  licenseUrl: string;
  noReleaseUrlExplanation: string;
  originalReleaseUrl: string;
  ownershipConfirmed: boolean;
  ownershipStatus: string;
  permissionEvidenceUrl: string;
  publicLicenseScope: string;
  rightsConfirmed: boolean;
  rightsNotes: string;
  sourceRepoUrl: string;
  thirdPartyContent: string;
};

export type SubmissionFiles = {
  bannerFile: File | null;
  coverFile: File | null;
  romFile: File | null;
};

export type UploadedSubmissionFile = {
  path: string;
  url: string;
};

type SubmitGameForReviewOptions = {
  createSubmission: (payload: ApiGameSubmissionPayload) => Promise<unknown>;
  fields: SubmissionFields;
  files: SubmissionFiles;
  removeFiles: (paths: string[]) => Promise<void>;
  uploadFile: (file: File, path: string) => Promise<string>;
  userId: string;
};

export class SubmissionCleanupError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super(
      "Submission metadata could not be saved, and uploaded files could not be cleaned up automatically. Please contact support before retrying.",
    );
    this.name = "SubmissionCleanupError";
    this.cause = cause;
  }
}

function getSubmissionRomExtension(filename: string) {
  const lowerFilename = filename.toLowerCase();
  return (
    SUPPORTED_SUBMISSION_ROM_EXTENSIONS.find((extension) =>
      lowerFilename.endsWith(extension),
    ) || null
  );
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function validateRomFile(file: Pick<File, "name" | "size"> | null) {
  if (!file) return "Attach a supported ROM file before submitting.";
  const extension = getSubmissionRomExtension(file.name);
  if (!extension) {
    return `ROM uploads must use one of these extensions: ${SUPPORTED_SUBMISSION_ROM_LABEL}.`;
  }
  const maxBytes = SUBMISSION_ROM_LIMITS_BY_EXTENSION[extension];
  if (file.size > maxBytes) {
    return `${extension.toUpperCase()} ROM files must be ${formatBytes(maxBytes)} or smaller.`;
  }
  return null;
}

export function validateSubmissionImageFile(
  file: Pick<File, "size" | "type"> | null,
) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    return "Use an image file for cover or banner art.";
  }
  if (file.size > MAX_SUBMISSION_IMAGE_BYTES) {
    return "Images must be 5 MB or smaller.";
  }
  return null;
}

export function getSubmissionRightsErrors(fields: SubmissionFields) {
  const errors: string[] = [];
  const ownershipStatus = fields.ownershipStatus.trim();
  const hostingPermission = fields.hostingPermission.trim();
  const publicLicenseScope = fields.publicLicenseScope.trim();
  const thirdPartyContent = fields.thirdPartyContent.trim();

  if (!ownershipStatus) errors.push("Choose who owns or controls the game.");
  if (!hostingPermission) {
    errors.push("Choose how Pixelated is allowed to host the submitted build.");
  }
  if (hostingPermission === "not_sure") {
    errors.push("Confirm hosting permission before submitting.");
  }
  if (!thirdPartyContent) {
    errors.push("Tell us whether the game uses third-party content.");
  }
  if (!publicLicenseScope) {
    errors.push("Choose whether a public license applies.");
  }
  if (!fields.attributionText.trim()) {
    errors.push("Add the credit/attribution text.");
  }
  if (
    !fields.originalReleaseUrl.trim() &&
    !fields.noReleaseUrlExplanation.trim()
  ) {
    errors.push("Add an original release/project URL or explain why there is none.");
  }
  if (ownershipStatus === "permission" && !fields.permissionEvidenceUrl.trim()) {
    errors.push("Add a permission evidence URL.");
  }
  if (
    (ownershipStatus === "public_project" ||
      hostingPermission === "license_allows" ||
      !["none_owned", "not_sure"].includes(publicLicenseScope)) &&
    !fields.sourceRepoUrl.trim()
  ) {
    errors.push("Add a source or evidence URL for public/license-based submissions.");
  }
  if (
    ["code", "everything"].includes(publicLicenseScope) &&
    !fields.codeLicenseSpdx.trim()
  ) {
    errors.push("Add the code license SPDX ID.");
  }
  if (
    ["assets", "everything"].includes(publicLicenseScope) &&
    !fields.assetLicenseSpdx.trim()
  ) {
    errors.push("Add the asset license SPDX ID.");
  }
  if (
    ["yes", "not_sure"].includes(thirdPartyContent) &&
    !fields.rightsNotes.trim() &&
    !fields.permissionEvidenceUrl.trim()
  ) {
    errors.push("Explain third-party content or add permission evidence.");
  }
  if (!fields.ownershipConfirmed) {
    errors.push("Confirm you created the game or have permission to submit it.");
  }
  if (!fields.hostingConfirmed) {
    errors.push("Confirm Pixelated may host this submission for review.");
  }
  if (!fields.rightsConfirmed) {
    errors.push("Confirm the submitted build and assets can be hosted.");
  }

  return errors;
}

export function createSubmissionObjectPath({
  folder,
  originalName,
  randomId = Math.random().toString(36).slice(2),
  timestamp = Date.now(),
  userId,
}: {
  folder: "banners" | "covers" | "roms";
  originalName: string;
  randomId?: string;
  timestamp?: number;
  userId: string;
}) {
  const fileExt = originalName.split(".").pop()?.toLowerCase() || "bin";
  return `${userId}/${folder}/${timestamp}-${randomId}.${fileExt}`;
}

export function getPublishErrorMessage(error: unknown, fallback: string) {
  if (error instanceof SubmissionCleanupError) return error.message;

  if (
    typeof error === "object" &&
    error &&
    "payload" in error &&
    typeof error.payload === "object" &&
    error.payload &&
    "error" in error.payload &&
    typeof error.payload.error === "string"
  ) {
    return error.payload.error;
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  return fallback;
}

async function uploadSubmissionFile({
  file,
  folder,
  uploadFile,
  userId,
}: {
  file: File;
  folder: "banners" | "covers" | "roms";
  uploadFile: (file: File, path: string) => Promise<string>;
  userId: string;
}): Promise<UploadedSubmissionFile> {
  const path = createSubmissionObjectPath({
    folder,
    originalName: file.name,
    userId,
  });
  const url = await uploadFile(file, path);
  return { path, url };
}

export async function submitGameForReview({
  createSubmission,
  fields,
  files,
  removeFiles,
  uploadFile,
  userId,
}: SubmitGameForReviewOptions) {
  const romError = validateRomFile(files.romFile);
  if (romError) throw new Error(romError);
  const romFile = files.romFile;
  if (!romFile) throw new Error("Attach a supported ROM file before submitting.");

  const coverError = validateSubmissionImageFile(files.coverFile);
  if (coverError) throw new Error(coverError);

  const bannerError = validateSubmissionImageFile(files.bannerFile);
  if (bannerError) throw new Error(bannerError);
  const rightsErrors = getSubmissionRightsErrors(fields);
  if (rightsErrors.length) throw new Error(rightsErrors[0]);

  const uploadedFiles: UploadedSubmissionFile[] = [];

  try {
    const rom = await uploadSubmissionFile({
      file: romFile,
      folder: "roms",
      uploadFile,
      userId,
    });
    uploadedFiles.push(rom);

    const cover = files.coverFile
      ? await uploadSubmissionFile({
          file: files.coverFile,
          folder: "covers",
          uploadFile,
          userId,
        })
      : null;
    if (cover) uploadedFiles.push(cover);

    const banner = files.bannerFile
      ? await uploadSubmissionFile({
          file: files.bannerFile,
          folder: "banners",
          uploadFile,
          userId,
        })
      : null;
    if (banner) uploadedFiles.push(banner);

    await createSubmission({
      assetLicenseSpdx: fields.assetLicenseSpdx.trim() || null,
      attributionText: fields.attributionText.trim(),
      authorName: fields.authorName.trim(),
      bannerUrl: banner?.url || null,
      codeLicenseSpdx: fields.codeLicenseSpdx.trim() || null,
      coverUrl: cover?.url || null,
      description: fields.description.trim() || null,
      email: fields.email.trim(),
      gameTitle: fields.gameTitle.trim(),
      hostingConfirmed: fields.hostingConfirmed,
      hostingPermission: fields.hostingPermission.trim(),
      licenseUrl: fields.licenseUrl.trim() || null,
      noReleaseUrlExplanation: fields.noReleaseUrlExplanation.trim() || null,
      originalReleaseUrl: fields.originalReleaseUrl.trim() || null,
      ownershipConfirmed: fields.ownershipConfirmed,
      ownershipStatus: fields.ownershipStatus.trim(),
      permissionEvidenceUrl: fields.permissionEvidenceUrl.trim() || null,
      publicLicenseScope: fields.publicLicenseScope.trim(),
      romUrl: rom.url,
      rightsConfirmed: fields.rightsConfirmed,
      rightsNotes: fields.rightsNotes.trim() || null,
      sourceRepoUrl: fields.sourceRepoUrl.trim() || null,
      thirdPartyContent: fields.thirdPartyContent.trim(),
    });
  } catch (error) {
    const uploadedPaths = uploadedFiles.map((file) => file.path);
    if (uploadedPaths.length) {
      try {
        await removeFiles(uploadedPaths);
      } catch {
        throw new SubmissionCleanupError(error);
      }
    }
    throw error;
  }
}
