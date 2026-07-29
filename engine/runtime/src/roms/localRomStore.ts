import fs from "fs";
import path from "path";

export const LOCAL_ROM_ROOT = path.resolve("/roms");

export function sanitizeUserId(userId: unknown): string {
  return typeof userId === "string" && /^[a-zA-Z0-9_-]+$/.test(userId)
    ? userId
    : "anonymous";
}

export function assertLocalRomPath(candidatePath: string): string {
  const resolvedPath = path.resolve(candidatePath);
  if (
    resolvedPath !== LOCAL_ROM_ROOT &&
    !resolvedPath.startsWith(`${LOCAL_ROM_ROOT}${path.sep}`)
  ) {
    throw new Error("Local ROM path escapes the configured storage root");
  }
  return resolvedPath;
}

export function getUserFolderPath(userId: unknown): string {
  const folderPath = assertLocalRomPath(
    path.resolve(LOCAL_ROM_ROOT, sanitizeUserId(userId)),
  );
  if (path.dirname(folderPath) !== LOCAL_ROM_ROOT) {
    throw new Error("Local Vault owner must resolve to one storage directory");
  }
  return folderPath;
}

export function getVaultFilePath(
  vaultFolder: string,
  filename: string,
): string {
  const safeFolder = assertLocalRomPath(vaultFolder);
  const safeName = path.basename(filename);
  if (
    !safeName ||
    safeName === "." ||
    safeName === ".." ||
    safeName !== filename
  ) {
    throw new Error("Invalid Local Vault filename");
  }

  const filePath = assertLocalRomPath(path.resolve(safeFolder, safeName));
  if (path.dirname(filePath) !== safeFolder) {
    throw new Error("Local Vault file must remain inside its owner directory");
  }
  return filePath;
}

export async function ensureUserFolder(userId: unknown): Promise<string> {
  const folderPath = getUserFolderPath(userId);
  await fs.promises.mkdir(folderPath, { recursive: true });
  const folderStat = await fs.promises.lstat(folderPath);
  if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) {
    throw new Error("Local Vault owner path must be a real directory");
  }
  return folderPath;
}
