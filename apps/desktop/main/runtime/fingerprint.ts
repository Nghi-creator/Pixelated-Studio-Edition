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

type RuntimeFile = {
  kind: "file" | "symlink";
  relativePath: string;
};

function listRuntimeFiles(rootDir: string, currentDir = rootDir): RuntimeFile[] {
  return fs.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) return [];
    if (entry.isFile() && shouldIgnoreFile(entry.name)) return [];

    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) return listRuntimeFiles(rootDir, entryPath);
    if (entry.isFile() || entry.isSymbolicLink()) {
      return [{
        kind: entry.isSymbolicLink() ? "symlink" as const : "file" as const,
        relativePath: path.relative(rootDir, entryPath).split(path.sep).join("/"),
      }];
    }
    return [];
  });
}

function readRegularFileWithoutFollowingLinks(filePath: string) {
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new Error(`Engine runtime entry is not a regular file: ${filePath}`);
    }
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function computeEngineRuntimeFingerprint(
  runtimeDir: string,
  runtimeKind: EngineRuntimeKind,
) {
  const files = listRuntimeFiles(runtimeDir).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
  if (!files.length) throw new Error(`Engine runtime is empty: ${runtimeDir}`);

  const hash = crypto.createHash("sha256");
  hash.update(`runtime-kind:${runtimeKind}\0`);
  for (const { kind, relativePath } of files) {
    const filePath = path.join(runtimeDir, relativePath);
    const bytes = kind === "symlink"
      ? Buffer.from(fs.readlinkSync(filePath))
      : readRegularFileWithoutFollowingLinks(filePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(kind);
    hash.update("\0");
    hash.update(String(bytes.length));
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}
