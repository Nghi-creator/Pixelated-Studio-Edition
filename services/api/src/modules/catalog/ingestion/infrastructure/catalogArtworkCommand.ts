import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readArtworkImage } from "./catalogArtworkImage.js";
export type CatalogArtworkCommandInput = {
  artifactBytes: Buffer;
  artifactFilename: string | null;
  buildId: string;
  gameId: string;
  platformId: string;
  runtimeId: string;
  title: string;
};
export type ParsedCaptureCommand = {
  args: string[];
  file: string;
};
export function parseCaptureCommand(command: string): ParsedCaptureCommand {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping)
    current += "\\";
  if (quote)
    throw new Error("Capture command contains an unterminated quote.");
  if (current)
    parts.push(current);
  const [file, ...args] = parts;
  if (!file)
    throw new Error("Capture command cannot be empty.");
  return { args, file };
}
export class CaptureCleanupError extends Error {
}
export function captureTimeout(environment: NodeJS.ProcessEnv = process.env) {
  const delay = Number(environment.PIXELATED_CAPTURE_DELAY_SECONDS || 35);
  const value = Number(environment.CATALOG_ARTWORK_CAPTURE_TIMEOUT_MS || (delay * 1000 + 90000));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 600000)
    throw new Error("Capture timeout must be an integer in 1..600000 ms.");
  return value;
}
export function runCaptureProcess(command: string, environment: NodeJS.ProcessEnv, { timeoutMs = captureTimeout(), terminateGraceMs = 1000, stdio = "ignore" as "ignore" | "inherit", } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000 ||
    !Number.isSafeInteger(terminateGraceMs) || terminateGraceMs <= 0 || terminateGraceMs > 10000) {
    throw new Error("Invalid capture process deadline.");
  }
  const parsed = parseCaptureCommand(command);
  return new Promise<void>((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(parsed.file, parsed.args, { env: environment, stdio, detached: grouped });
    let timedOut = false;
    let done = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    let reap: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (done)
        return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(force);
      clearTimeout(reap);
      if (error)
        reject(error);
      else
        resolve();
    };
    const signal = (name: NodeJS.Signals) => {
      try {
        if (grouped && child.pid)
          process.kill(-child.pid, name);
        else
          child.kill(name);
      }
      catch { /* Exit may already be in flight; close remains the confirmation. */ }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      force = setTimeout(() => {
        signal("SIGKILL");
        reap = setTimeout(() => finish(new CaptureCleanupError("Capture deadline exceeded; child exit could not be confirmed.")), 1000);
      }, terminateGraceMs);
    }, timeoutMs);
    child.once("error", error => finish(error));
    child.once("close", (code, exitSignal) => {
      if (timedOut) {
        // The leader may exit on TERM while one of its owned descendants remains.
        if (grouped)
          signal("SIGKILL");
        finish(new Error(`Capture command timed out after ${timeoutMs}ms.`));
      }
      else if (code === 0)
        finish();
      else
        finish(new Error(`Capture command failed: ${exitSignal ? `signal ${exitSignal}` : `exit ${code}`}.`));
    });
  });
}
export async function captureGameplayArtworkWithCommand(command: string, input: CatalogArtworkCommandInput) {
  const timeoutMs = captureTimeout(); // Reject configuration before allocating files or spawning.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pixelated-promotion-artwork-"));
  let retain = false;
  try {
    const romPath = path.join(tempDir, `game${path.extname(input.artifactFilename || "") || ".rom"}`);
    const outputPath = path.join(tempDir, "capture.png");
    await fs.writeFile(romPath, input.artifactBytes);
    await runCaptureProcess(command, { ...process.env,
      PIXELATED_CAPTURE_ARTIFACT_FILENAME: input.artifactFilename || "",
      PIXELATED_CAPTURE_GAME_ID: input.gameId, PIXELATED_CAPTURE_GAME_TITLE: input.title,
      PIXELATED_CAPTURE_OUTPUT_PATH: outputPath, PIXELATED_CAPTURE_PLATFORM_ID: input.platformId,
      PIXELATED_CAPTURE_ROM_PATH: romPath, PIXELATED_CAPTURE_RUNTIME_ID: input.runtimeId,
    }, { timeoutMs });
    return await readArtworkImage(outputPath);
  }
  catch (error) {
    retain = error instanceof CaptureCleanupError;
    throw error;
  }
  finally {
    if (!retain)
      await fs.rm(tempDir, { recursive: true, force: true });
  }
}
