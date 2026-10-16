import fs from "node:fs";
import path from "node:path";
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
export function writeHostedPairingReport(config, state, failure) {
  const { runDir, summaryPath, reportPath, apiUrl, webUrl, runId } = config;
  const { browserConsole, browserNetwork, browserRequestFailures, steps } = state;
  writeJson(path.join(runDir, "browser-console.json"), browserConsole);
  writeJson(path.join(runDir, "browser-network.json"), browserNetwork);
  writeJson(path.join(runDir, "browser-request-failures.json"), browserRequestFailures);
  writeJson(reportPath, {
    apiUrl,
    failure: failure?.message || null,
    finishedAt: new Date().toISOString(),
    runId,
    steps,
    logDrops: state.logDrops,
    webUrl,
  });
  fs.writeFileSync(summaryPath, [
    `# Hosted Pairing Smoke ${failure ? "Failed" : "Passed"}`,
    "",
    `- Web: ${webUrl}`,
    `- API: ${apiUrl}`,
    `- Run: ${runId}`,
    `- Result: ${failure ? failure.message : "All checks passed."}`,
    "",
    "## Checks",
    ...steps.map(({ detail, name, status }) => `- [${status === "pass" ? "x" : " "}] ${name}${detail ? `: ${detail}` : ""}`),
    "",
  ].join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, fs.readFileSync(summaryPath));
  }
  console.log(`Hosted pairing smoke bundle: ${runDir}`);
}
