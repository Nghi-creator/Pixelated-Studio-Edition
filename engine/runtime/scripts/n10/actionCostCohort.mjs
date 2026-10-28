/** Independent fixed-order action/unchanged sessions; no cost-limit or qualification claim. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireNativeCohort } from "./nativeCohort.mjs";

export const ACTION_COST_ORDER = Object.freeze(["unchanged", "action", "action", "unchanged", "unchanged", "action"].map((condition) => `engineering-game-${condition}-cost`));

export const ACTION_COST_ORDER_V2 = Object.freeze(ACTION_COST_ORDER.map((mode) => mode + "-v2"));

export async function runActionCostCohort(image, outputPath, version = "v1") {
  if (!["v1", "v2"].includes(version)) throw new Error("closed action-cost protocol version required");
  return acquireNativeCohort(image, outputPath, version === "v2" ? ACTION_COST_ORDER_V2 : ACTION_COST_ORDER);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (![6, 8].includes(process.argv.length) || process.argv[2] !== "--image" || process.argv[4] !== "--output" || (process.argv.length === 8 && process.argv[6] !== "--protocol")) throw new Error("use --image sha256:<cached-image-id> --output /absolute/new/receipt.json [--protocol v1|v2]");
    const runs = await runActionCostCohort(process.argv[3], process.argv[5], process.argv[7]);
    console.log(JSON.stringify({ completed: runs.length, acquisitions: runs.map((run) => ({ mode: run.mode, status: run.status })), live_authority: false }));
    if (runs.length !== 6 || runs.some((run) => run.status !== "passed")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
