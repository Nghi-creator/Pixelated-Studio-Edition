import path from "node:path";
import { randomBytes } from "node:crypto";
function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}
export function createHostedPairingConfig(environment = process.env, argv = process.argv.slice(2)) {
  for (const value of argv)
    if (!["--help", "--contract-only"].includes(value))
      throw new Error(`Unknown hosted pairing option: ${value}`);
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const webUrl = normalizeUrl(environment.HOSTED_WEB_URL || "https://pixelated-studio-edition.vercel.app");
  const apiUrl = normalizeUrl(environment.HOSTED_API_URL || "https://pixelated-api-services-6ovi.onrender.com");
  const email = environment.HOSTED_SMOKE_EMAIL || environment.STAGING_SMOKE_EMAIL;
  const supabaseUrl = normalizeUrl(environment.HOSTED_SUPABASE_URL || "");
  const serviceRoleKey = environment.HOSTED_SUPABASE_SERVICE_ROLE_KEY || "";
  const companionUrl = "https://localhost:8090";
  const engineToken = `hosted-smoke-engine-${randomBytes(24).toString("hex")}`;
  const hostedPairingBuildMarker = "Desktop launch pairing registration v1 failed after local redemption.";
  const hostedRuntimeSwitchBuildMarker = "Pixelated Desktop is still switching to the native Linux engine.";
  const hostedPublishTimeoutMs = Number(environment.HOSTED_SMOKE_PUBLISH_TIMEOUT_MS || 10 * 60 * 1000);
  const renderBaselineStartedAtSeconds = Number(environment.HOSTED_SMOKE_RENDER_BASELINE_STARTED_AT_SECONDS || 0);
  const vercelBaselineHtmlSha256 = environment.HOSTED_SMOKE_VERCEL_BASELINE_HTML_SHA256 || "";
  const runId = `hosted-pairing-${new Date().toISOString().replaceAll(":", "-")}`;
  const runDir = path.resolve(environment.HOSTED_SMOKE_ARTIFACT_DIR ||
    path.join(rootDir, ".artifacts", "hosted-pairing-smoke", runId));
  const reportPath = path.join(runDir, "hosted-pairing-report.json");
  const summaryPath = path.join(runDir, "failure-summary.md");
  for (const value of [webUrl, apiUrl, ...(supabaseUrl ? [supabaseUrl] : [])]) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("Hosted smoke requires HTTP(S) bases without credentials, query or fragment.");
  }
  if (!Number.isSafeInteger(hostedPublishTimeoutMs) || hostedPublishTimeoutMs <= 0 || hostedPublishTimeoutMs > 1800000 || !Number.isFinite(renderBaselineStartedAtSeconds) || renderBaselineStartedAtSeconds < 0)
    throw new Error("Invalid hosted smoke readiness deadline/baseline.");
  return { rootDir, webUrl, apiUrl, email, supabaseUrl, serviceRoleKey, companionUrl, engineToken, hostedPairingBuildMarker, hostedRuntimeSwitchBuildMarker, hostedPublishTimeoutMs, renderBaselineStartedAtSeconds, vercelBaselineHtmlSha256, runId, runDir, reportPath, summaryPath, contractOnly: argv.includes("--contract-only"), help: argv.includes("--help") };
}
