/** Separate contained fault-cost cohort; every attempt retained without retries. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireNativeCohort } from "./nativeCohort.mjs";

export const FAULT_COST_ORDER = Object.freeze(["cancel", "receiver-loss", "source-loss", "reconnect"].map((s) => `engineering-game-${s}-cost`));
export async function runFaultCostCohort(image, output) { return acquireNativeCohort(image, output, FAULT_COST_ORDER); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6 || process.argv[2] !== "--image" || process.argv[4] !== "--output") throw new Error("use --image sha256:<cached-image-id> --output /absolute/new/receipt.json");
    const runs = await runFaultCostCohort(process.argv[3], process.argv[5]);
    console.log(JSON.stringify({ completed: runs.length, acquisitions: runs.map((run) => ({ mode: run.mode, status: run.status })), live_authority: false }));
    if (runs.length !== 4 || runs.some((run) => run.status !== "passed")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
