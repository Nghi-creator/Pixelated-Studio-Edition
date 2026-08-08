import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { EngineRuntimeKind } from "./config";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "__pycache__",
  "dist",
  "node_modules",
]);

function shouldIgnoreFile(name: string) {
  return name === ".DS_Store" || name.endsWith(".pyc") || name.startsWith("npm-debug.log");
}

function listRuntimeFiles(rootDir: string, currentDir = rootDir): string[] {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    if (entry.isFile() && shouldIgnoreFile(entry.name)) return [];

    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) return listRuntimeFiles(rootDir, entryPath);
    if (entry.isFile() || entry.isSymbolicLink()) {
      return [path.relative(rootDir, entryPath).split(path.sep).join("/")];
    }
    return [];
  });
}

export function computeEngineRuntimeFingerprint(
  runtimeDir: string,
  runtimeKind: EngineRuntimeKind,
) {
  const files = listRuntimeFiles(runtimeDir).sort();
  if (!files.length) throw new Error(`Engine runtime is empty: ${runtimeDir}`);

  const hash = crypto.createHash("sha256");
  hash.update(`runtime-kind:${runtimeKind}\0`);
  for (const relativePath of files) {
    const filePath = path.join(runtimeDir, relativePath);
    const stat = fs.lstatSync(filePath);
    const bytes = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(filePath))
      : fs.readFileSync(filePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(bytes.length));
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}
