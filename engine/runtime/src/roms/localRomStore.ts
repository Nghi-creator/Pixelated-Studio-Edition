import fs from "fs";
import path from "path";

export function sanitizeUserId(userId: unknown): string {
  return typeof userId === "string" && /^[a-zA-Z0-9_-]+$/.test(userId)
    ? userId
    : "anonymous";
}

export function getUserFolder(userId: unknown): string {
  const folderPath = path.join("/roms", sanitizeUserId(userId));
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
}
