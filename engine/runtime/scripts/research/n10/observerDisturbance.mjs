/** Fixed-order paired acquisition. Every case retained; no retry or qualification promotion. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireNativeCohort } from "./nativeCohort.mjs";

export async function runObserverCohort(image, outputPath, protocol = "v1") {
  if (!["v1", "moving-v2"].includes(protocol)) throw new Error("closed observer protocol required");
  const order = ["off", "on", "on", "off", "off", "on"].map((condition) => `${protocol === "moving-v2" ? "observer-moving" : "observer"}-${condition}`);
  return acquireNativeCohort(image, outputPath, order);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (![6, 8].includes(process.argv.length) || process.argv[2] !== "--image" || process.argv[4] !== "--output" || (process.argv.length === 8 && process.argv[6] !== "--protocol")) throw new Error("use --image sha256:<cached-image-id> --output /absolute/new/receipt.json [--protocol v1|moving-v2]");
    const runs = await runObserverCohort(process.argv[3], process.argv[5], process.argv[7]);
    console.log(JSON.stringify({ completed: runs.length, acquisitions: runs.map((run) => ({ mode: run.mode, status: run.status })), live_authority: false }));
    if (runs.length !== 6 || runs.some((run) => run.status !== "passed")) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
