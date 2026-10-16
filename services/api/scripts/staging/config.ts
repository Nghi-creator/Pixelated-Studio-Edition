export type SmokeMode = "access-log-schema" | "catalog-rpc" | "full" | "submission-cleanup-policy";
export function parseArgs(args: string[]): SmokeMode {
  if (args.length === 0)
    return "full";
  if (args.length === 1 && args[0] === "--access-log-schema-only") {
    return "access-log-schema";
  }
  if (args.length === 1 && args[0] === "--submission-cleanup-policy-only") {
    return "submission-cleanup-policy";
  }
  if (args.length === 1 && args[0] === "--catalog-rpc-only") {
    return "catalog-rpc";
  }
  throw new Error(`Unknown arguments: ${args.join(" ")}. Supported options: --access-log-schema-only, --submission-cleanup-policy-only, --catalog-rpc-only`);
}
export function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("Staging base URL must be HTTP(S) without credentials, query or fragment.");
  return value.replace(/\/+$/, "");
}
export function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  }
  catch {
    throw new Error("STAGING_STUDIO_ORIGIN is not a valid URL.");
  }
}
export function createStagingConfig(environment: NodeJS.ProcessEnv = process.env) {
  return { environment,
    apiUrl: normalizeBaseUrl(environment.STAGING_API_URL || environment.API_URL || "https://pixelated-api-services-6ovi.onrender.com"),
    configuredBearerToken: environment.STAGING_BEARER_TOKEN || environment.SUPABASE_ACCESS_TOKEN,
    stagingSupabaseUrl: environment.STAGING_SUPABASE_URL || environment.SUPABASE_URL,
    stagingSupabaseAnonKey: environment.STAGING_SUPABASE_ANON_KEY || environment.SUPABASE_ANON_KEY,
    configuredGameId: environment.STAGING_GAME_ID,
    smokeEngineUrl: environment.STAGING_SMOKE_ENGINE_URL || "http://127.0.0.1:8080",
    stagingStudioOrigin: normalizeOrigin(environment.STAGING_STUDIO_ORIGIN || "https://pixelated-studio-edition.vercel.app"),
  };
}
export type StagingConfig = ReturnType<typeof createStagingConfig>;
export function logStep(message: string) { console.log(`smoke: ${message}`); }
export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
