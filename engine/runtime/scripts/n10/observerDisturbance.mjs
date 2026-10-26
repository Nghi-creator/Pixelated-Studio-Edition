/** Fixed-order paired acquisition. Every case retained; no retry or qualification promotion. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNativeBrowserAcceptance } from "./nativeBrowserAcceptance.mjs";

export async function runObserverCohort(image, outputPath) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image || "") || typeof outputPath !== "string" || !path.isAbsolute(outputPath)) throw new Error("cached image and absolute exclusive output required");
  const output = await fs.open(outputPath, "wx", 0o600);
  const runs = [];
  try {
    for (const mode of ["observer-off", "observer-on", "observer-on", "observer-off", "observer-off", "observer-on"]) {
      try { runs.push(await runNativeBrowserAcceptance(image, mode)); }
      catch (error) { runs.push({ status: "failed", mode, live_authority: false, failure: error.message }); }
      // Checkpoint every case, including failures, without changing its identity.
      await output.truncate(0);
      await output.write(JSON.stringify(runs, null, 2) + "\n", 0, "utf8");
      await output.sync();
      if (runs.at(-1).failure?.includes("cleanup unconfirmed")) break;
    }
    return runs;
  } finally { await output.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== "--image" || process.argv[4] !== "--output") throw new Error("use --image sha256:<cached-image-id> --output /absolute/new/receipt.json");
    const runs = await runObserverCohort(process.argv[3], process.argv[5]);
    console.log(JSON.stringify({ completed: runs.length, acquisitions: runs.map((run) => ({ mode: run.mode, status: run.status })), live_authority: false }));
    if (runs.length !== 6 || runs.some((run) => run.status !== "passed")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
