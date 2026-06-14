import type { ApiGameSubmissionPayload } from "../../lib/apiTypes";

export const MAX_SUBMISSION_ROM_BYTES = 8 * 1024 * 1024;
export const MAX_SUBMISSION_IMAGE_BYTES = 5 * 1024 * 1024;

export type SubmissionFields = {
  authorName: string;
  description: string;
  email: string;
  gameTitle: string;
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

export function validateRomFile(file: Pick<File, "name" | "size"> | null) {
  if (!file) return "Attach your .nes ROM file before submitting.";
  if (!file.name.toLowerCase().endsWith(".nes")) {
    return "ROM uploads must use the .nes file extension.";
  }
  if (file.size > MAX_SUBMISSION_ROM_BYTES) {
    return "ROM files must be 8 MB or smaller.";
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
  if (!romFile) throw new Error("Attach your .nes ROM file before submitting.");

  const coverError = validateSubmissionImageFile(files.coverFile);
  if (coverError) throw new Error(coverError);

  const bannerError = validateSubmissionImageFile(files.bannerFile);
  if (bannerError) throw new Error(bannerError);

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
      authorName: fields.authorName.trim(),
      bannerUrl: banner?.url || null,
      coverUrl: cover?.url || null,
      description: fields.description.trim() || null,
      email: fields.email.trim(),
      gameTitle: fields.gameTitle.trim(),
      romUrl: rom.url,
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
