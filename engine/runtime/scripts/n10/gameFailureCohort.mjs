/** Complete/cancel/receiver-loss/source-loss/reconnect; no retries or replacements. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireNativeCohort } from "./nativeCohort.mjs";

export const gameFailureOrder = Object.freeze(["engineering-game-disturbance", "engineering-game-cancel",
  "engineering-game-receiver-loss", "engineering-game-source-loss", "engineering-game-reconnect"]);

export async function runGameFailureCohort(image, outputPath) {
  return acquireNativeCohort(image, outputPath, gameFailureOrder);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== "--image" || process.argv[4] !== "--output") throw new Error("use --image sha256:<cached-image-id> --output /absolute/new/receipt.json");
    const runs = await runGameFailureCohort(process.argv[3], process.argv[5]);
    console.log(JSON.stringify({completed: runs.length, acquisitions: runs.map((r) => ({mode:r.mode,status:r.status})),live_authority:false}));
    if (runs.length !== gameFailureOrder.length || runs.some((run) => run.status !== "passed")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
