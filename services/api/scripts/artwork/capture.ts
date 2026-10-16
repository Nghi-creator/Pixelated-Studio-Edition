import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sanitizeCatalogObjectSegment } from "../../src/modules/catalog/domain/catalogObjectPath.js";
import { readBoundedResponse } from "../../src/infrastructure/boundedRead.js";
import { CaptureCleanupError, captureTimeout, runCaptureProcess } from "../../src/modules/catalog/ingestion/infrastructure/catalogArtworkCommand.js";
import { assertReadableImage } from "../../src/modules/catalog/ingestion/infrastructure/catalogArtworkImage.js";
import type { CaptureTarget, CaptureResult } from "./types.js";
export async function findLocalArtwork(target: CaptureTarget, artworkDir: string | null) {
  if (!artworkDir)
    return null;
  const names = [target.game.id, sanitizeCatalogObjectSegment(target.game.title.toLowerCase(), "artwork").toLowerCase(),
    target.build.id, target.build.artifact_sha256 || "", target.build.artifact_filename ? path.basename(target.build.artifact_filename, path.extname(target.build.artifact_filename)) : ""];
  for (const name of names.filter(Boolean)) {
    if (path.basename(name) !== name)
      continue;
    for (const extension of [".png", ".jpg", ".jpeg", ".webp"]) {
      const candidate = path.resolve(artworkDir, `${name}${extension}`);
      try {
        if ((await fs.stat(candidate)).isFile())
          return candidate;
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          throw error;
      }
    }
  }
  return null;
}
export async function downloadArtifact(target: CaptureTarget, destinationPath: string, fetchImpl: typeof fetch = fetch) {
  if (!target.build.artifact_url)
    throw new Error("Capture target has no artifact URL.");
  const response = await fetchImpl(target.build.artifact_url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Artifact download returned HTTP ${response.status}.`);
  }
  const bytes = await readBoundedResponse(response, 64 * 1024 * 1024);
  if (target.build.artifact_sha256 && crypto.createHash("sha256").update(bytes).digest("hex") !== target.build.artifact_sha256.toLowerCase())
    throw new Error("Artifact checksum mismatch.");
  await fs.writeFile(destinationPath, bytes);
}
export async function withCapturedArtwork<T>(target: CaptureTarget, options: {
  artworkDir: string | null;
  captureCommand: string | null;
}, consume: (result: CaptureResult) => Promise<T>): Promise<T> {
  const local = await findLocalArtwork(target, options.artworkDir);
  if (local) {
    await assertReadableImage(local);
    return consume({ imagePath: local, source: "local-artwork" });
  }
  if (!options.captureCommand)
    return consume({ source: "none", reason: "no local artwork matched and no --capture-command was provided" });
  const timeoutMs = captureTimeout();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "pixelated-artwork-"));
  let retain = false;
  try {
    const romPath = path.join(temporary, `game${path.extname(target.build.artifact_filename || "") || ".rom"}`);
    const outputPath = path.join(temporary, "capture.png");
    await downloadArtifact(target, romPath);
    await runCaptureProcess(options.captureCommand, { ...process.env,
      PIXELATED_CAPTURE_ARTIFACT_FILENAME: target.build.artifact_filename || "", PIXELATED_CAPTURE_GAME_ID: target.game.id,
      PIXELATED_CAPTURE_GAME_TITLE: target.game.title, PIXELATED_CAPTURE_OUTPUT_PATH: outputPath,
      PIXELATED_CAPTURE_PLATFORM_ID: target.build.platform_id || "", PIXELATED_CAPTURE_ROM_PATH: romPath,
      PIXELATED_CAPTURE_RUNTIME_ID: target.build.runtime_id || "" }, { timeoutMs, stdio: "inherit" });
    await assertReadableImage(outputPath);
    return await consume({ imagePath: outputPath, source: "capture-command" });
  }
  catch (error) {
    retain = error instanceof CaptureCleanupError;
    throw error;
  }
  finally {
    if (!retain)
      await fs.rm(temporary, { recursive: true, force: true });
  }
}
