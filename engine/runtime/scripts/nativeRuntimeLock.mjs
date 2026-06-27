import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const runtimeRoot = path.resolve(scriptDir, "..");

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function loadNativeRuntimeLock(manifestPath) {
  const bytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error("Native runtime lock manifest must include packages.");
  }
  if (!manifest.runtimeId || typeof manifest.runtimeId !== "string") {
    throw new Error("Native runtime lock manifest must include runtimeId.");
  }
  return { bytes, hash: sha256(bytes), manifest };
}

export function nativeRuntimeImageTag(manifest, lockHash) {
  return `pixelated-engine-native:${manifest.runtimeId}-${lockHash.slice(0, 12)}`;
}
