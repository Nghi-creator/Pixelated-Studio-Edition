#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nowIso, printCheck } from "./multiplayerSmokeHealth.mjs";
import { parseArgs, printUsage } from "./multiplayerSmokeOptions.mjs";
import { run } from "./multiplayerSmokeRun.mjs";
import { cleanupRun } from "./multiplayerSmokeCleanup.mjs";
export { parseArgs } from "./multiplayerSmokeOptions.mjs";
export { connectCompanionGuest, makeSyntheticOffer } from "./multiplayerSmokeCompanion.mjs";
export { getCameraPeerState, isHttpsCompanion, normalizeInviteCode, preflightCompanion, redeemCompanionInvite, summarizeHealth } from "./multiplayerSmokeHealth.mjs";
export { validateCapturedTelemetry } from "./multiplayerSmokeTelemetry.mjs";
if (process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const runState = {};
  const operation = process.argv.includes("--help") ? Promise.resolve(printUsage()) : Promise.resolve().then(() => run(parseArgs(process.argv.slice(2)), runState));
  operation.catch(async (err) => {
    const activeRun = runState.activeRun;
    const message = err instanceof Error ? err.message : String(err);
    if (activeRun) {
      const cleanupFailures = await cleanupRun(activeRun);
      const failedReport = {
        artifacts: {
          ...activeRun.artifactPaths,
        },
        engineUrl: activeRun.options.engineUrl,
        error: message,
        expectedGuests: activeRun.options.expectedGuests,
        passed: false,
        cleanupFailures,
        checks: activeRun.checks || [],
        runId: activeRun.runId,
        timestamp: nowIso(),
      };
      fs.writeFileSync(activeRun.reportPath, `${JSON.stringify(failedReport, null, 2)}\n`);
      activeRun.log.write("run-fail", {
        message,
        reportPath: activeRun.reportPath,
      });
      console.error(`[smoke] Bundle: ${activeRun.artifactPaths.runDir}`);
      console.error(`[smoke] Report: ${activeRun.reportPath}`);
    }
    printCheck("FAIL", "LAN companion multiplayer smoke", message);
    process.exitCode = 1;
  });
}
