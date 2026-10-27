/** Bounded exclusive acquisition with retained failures and per-case checkpoints. */
import fs from "node:fs/promises";
import path from "node:path";
import { runNativeBrowserAcceptance } from "./nativeBrowserAcceptance.mjs";

export async function acquireNativeCohort(image, outputPath, order) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image || "") || typeof outputPath !== "string" || !path.isAbsolute(outputPath)) throw new Error("cached image and absolute exclusive output required");
  if (!Array.isArray(order) || order.length < 1 || order.length > 8 || order.some((mode) => typeof mode !== "string")) throw new Error("bounded predeclared native order required");
  const output = await fs.open(outputPath, "wx", 0o600);
  const runs = [];
  try {
    for (const mode of order) {
      try { runs.push(await runNativeBrowserAcceptance(image, mode)); }
      catch (error) { runs.push({ status: "failed", mode, live_authority: false, failure: error.message, ...(error.acquisition ? { acquisition: error.acquisition } : {}) }); }
      await output.truncate(0);
      await output.write(JSON.stringify(runs, null, 2) + "\n", 0, "utf8");
      await output.sync();
      if (runs.at(-1).failure?.includes("cleanup unconfirmed")) break;
    }
    return runs;
  } finally { await output.close(); }
}
