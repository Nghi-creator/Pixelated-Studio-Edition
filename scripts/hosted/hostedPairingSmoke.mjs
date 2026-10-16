import { redactSmokeText } from "../shared/smokeArtifacts.mjs";
import { createHostedPairingConfig } from "./hostedPairingConfig.mjs";
import { createHostedPairingRun } from "./hostedPairingRuntime.mjs";
import { writeHostedPairingReport } from "./hostedPairingReport.mjs";
let run, config, failure = null;
try {
  config = createHostedPairingConfig();
  if (config.help) {
    console.log(`Usage: npm run smoke:hosted-pairing

Required:
  HOSTED_SMOKE_EMAIL
  HOSTED_SUPABASE_URL
  HOSTED_SUPABASE_SERVICE_ROLE_KEY

Optional:
  HOSTED_WEB_URL
  HOSTED_API_URL
  HOSTED_SMOKE_ARTIFACT_DIR
  HOSTED_SMOKE_PUBLISH_TIMEOUT_MS
  HOSTED_SMOKE_RENDER_BASELINE_STARTED_AT_SECONDS
  HOSTED_SMOKE_VERCEL_BASELINE_HTML_SHA256

Validation:
  --contract-only`);
  }
  else {
    run = createHostedPairingRun(config);
    await run.main();
  }
}
catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  failure.message = redactSmokeText(failure.message, [config?.serviceRoleKey, config?.engineToken]);
  console.error(`Hosted pairing smoke failed: ${failure.message}`);
  await run?.captureFailure();
  process.exitCode = 1;
}
finally {
  if (run) {
    const failures = await run.cleanup();
    for (const entry of failures)
      run.record(`cleanup: ${entry.name}`, "fail", entry.error);
    if (failures.length) {
      failure ||= new Error("Hosted pairing cleanup failed; see report checks.");
      process.exitCode = 1;
    }
    writeHostedPairingReport(config, run.state(), failure);
  }
}
