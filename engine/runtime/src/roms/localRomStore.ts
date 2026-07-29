import fs from "fs";
import path from "path";

export function sanitizeUserId(userId: unknown): string {
  return typeof userId === "string" && /^[a-zA-Z0-9_-]+$/.test(userId)
    ? userId
    : "anonymous";
}

export function getUserFolderPath(userId: unknown): string {
  return path.join("/roms", sanitizeUserId(userId));
}

export async function ensureUserFolder(userId: unknown): Promise<string> {
  const folderPath = getUserFolderPath(userId);
  await fs.promises.mkdir(folderPath, { recursive: true });
  return folderPath;
}
