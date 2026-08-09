import fs from "fs";
import path from "path";
import { validateGameArtifact } from "./artifactValidation";
import {
  assertLocalRomPath,
  ensureUserFolder,
  getUserFolderPath,
  getVaultFilePath,
  sanitizeUserId,
} from "./localRomStore";
import {
  findRuntimeByExtension,
  getSupportedExtensions,
} from "../runtime/runtimeRegistry";

export type VaultOwnerContext = {
  accessScope?: string;
  legacyUserIdCandidate?: string;
  ownerIdCandidate: string;
};

type FileSystemError = Error & { code?: string };
export const VAULT_STAT_CONCURRENCY = 16;

export async function mapWithConcurrency<T, Result>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<Result>,
) {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Concurrency must be a positive integer");
  }

  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function isRealDirectory(folderPath: string) {
  try {
    const folderStat = await fs.promises.lstat(assertLocalRomPath(folderPath));
    return folderStat.isDirectory() && !folderStat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function resolveVaultFolder(context: VaultOwnerContext) {
  const ownerId = path.basename(context.ownerIdCandidate);
  if (
    !ownerId ||
    ownerId !== context.ownerIdCandidate ||
    sanitizeUserId(ownerId) !== ownerId
  ) {
    throw new Error("Missing authenticated engine client identity");
  }

  const ownerFolder = getUserFolderPath(ownerId);
  if (await isRealDirectory(ownerFolder)) return ownerFolder;

  if (
    context.accessScope !== "companion-host" &&
    context.accessScope !== "companion-guest"
  ) {
    const legacyCandidate = context.legacyUserIdCandidate || "";
    const legacyUserId = path.basename(legacyCandidate);
    const legacyFolder = getUserFolderPath(legacyUserId);
    if (
      legacyUserId === legacyCandidate &&
      sanitizeUserId(legacyUserId) === legacyUserId &&
      legacyUserId !== "anonymous" &&
      legacyFolder !== ownerFolder &&
      (await isRealDirectory(legacyFolder))
    ) {
      await fs.promises.rename(
        assertLocalRomPath(legacyFolder),
        assertLocalRomPath(ownerFolder),
      );
      return ownerFolder;
    }
  }

  return ensureUserFolder(ownerId);
}

export async function listVaultGames(context: VaultOwnerContext) {
  const userFolder = await resolveVaultFolder(context);
  const supportedExtensions = getSupportedExtensions();
  const entries = await fs.promises.readdir(userFolder, { withFileTypes: true });
  const supportedFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      supportedExtensions.some((extension) =>
        entry.name.toLowerCase().endsWith(extension),
      ),
  );
  const files = await mapWithConcurrency(
    supportedFiles,
    VAULT_STAT_CONCURRENCY,
    async (entry) => ({
      name: entry.name,
      time: (
        await fs.promises.stat(getVaultFilePath(userFolder, entry.name))
      ).mtime.getTime(),
    }),
  );
  return files.sort((a, b) => b.time - a.time).map((file) => file.name);
}

export async function validateVaultUpload(
  context: VaultOwnerContext,
  uploadedFile: { filename: string; path: string },
) {
  const userFolder = await resolveVaultFolder(context);
  const uploadedFilePath = getVaultFilePath(userFolder, uploadedFile.filename);
  if (assertLocalRomPath(uploadedFile.path) !== uploadedFilePath) {
    throw new Error("Multer upload path did not match the vault path");
  }

  const runtime = findRuntimeByExtension(uploadedFile.filename);
  if (!runtime) {
    await fs.promises.unlink(uploadedFilePath).catch(() => undefined);
    return { error: "Unsupported game file type", ok: false as const };
  }

  try {
    validateGameArtifact(uploadedFilePath, {
      fileLabel: "Local game file",
      runtimeId: runtime.id,
    });
    return { filename: uploadedFile.filename, ok: true as const };
  } catch (error) {
    await fs.promises.unlink(uploadedFilePath).catch(() => undefined);
    return {
      error: error instanceof Error ? error.message : "Invalid game file",
      ok: false as const,
    };
  }
}

export async function deleteVaultGame(
  context: VaultOwnerContext,
  encodedFilename: string,
) {
  const userFolder = await resolveVaultFolder(context);
  const decodedName = decodeURIComponent(encodedFilename);
  const safeName = path.basename(decodedName);
  if (safeName !== decodedName) return { status: "invalid" } as const;

  try {
    await fs.promises.unlink(getVaultFilePath(userFolder, safeName));
    return { filename: safeName, status: "deleted" } as const;
  } catch (error) {
    if ((error as FileSystemError).code === "ENOENT") {
      return { status: "not_found" } as const;
    }
    throw error;
  }
}
