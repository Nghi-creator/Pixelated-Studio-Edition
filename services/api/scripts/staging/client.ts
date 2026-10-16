import { createClient } from "@supabase/supabase-js";
import { readBoundedResponse, withRequestDeadline } from "../../src/infrastructure/boundedRead.js";
import { normalizeBaseUrl, logStep, type StagingConfig } from "./config.js";
export type JsonRecord = Record<string, unknown>;
type AccessLogErrorPayload = {
  code?: string;
  error?: string;
};
function requiresStudioOrigin(method: string, path: string) {
  const pathname = path.split("?", 1)[0] || "/";
  return (pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    (method === "POST" && pathname === "/submissions/games"));
}
function getSupabaseProjectRef(url: string | undefined) {
  if (!url)
    return null;
  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix)
      ? hostname.slice(0, -suffix.length)
      : hostname;
  }
  catch {
    return null;
  }
}
export function createStagingClient(config: StagingConfig, fetchImpl: typeof fetch = fetch) {
  const { apiUrl, configuredBearerToken, stagingSupabaseUrl, stagingSupabaseAnonKey, stagingStudioOrigin, environment } = config;
  let authHeaders: Record<string, string> = {};
  let bearerToken = "";
  async function resolveBearerToken() {
    if (configuredBearerToken) {
      logStep("using configured bearer token");
      return configuredBearerToken;
    }
    const email = environment.STAGING_SMOKE_EMAIL;
    const password = environment.STAGING_SMOKE_PASSWORD;
    if (!stagingSupabaseUrl || !stagingSupabaseAnonKey || !email || !password) {
      throw new Error("Missing smoke authentication. Provide STAGING_BEARER_TOKEN, or provide " +
        "STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SMOKE_EMAIL, " +
        "and STAGING_SMOKE_PASSWORD for automatic sign-in.");
    }
    logStep("signing in dedicated staging smoke account");
    const response = await fetchImpl(`${normalizeBaseUrl(stagingSupabaseUrl)}/auth/v1/token?grant_type=password`, {
      body: JSON.stringify({ email, password }),
      headers: {
        apikey: stagingSupabaseAnonKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(20000),
    });
    const text = (await readBoundedResponse(response, 1024 * 1024)).toString("utf8");
    const payload = text
      ? (parseJson(text, "Supabase password grant") as {
        access_token?: string;
        error?: string;
        error_code?: string;
        msg?: string;
      })
      : {};
    if (!response.ok || !payload || typeof payload.access_token !== "string" || !payload.access_token.trim()) {
      const captchaHint = response.status === 400
        ? " If Supabase Auth CAPTCHA is enabled, password-grant smoke sign-in cannot complete the interactive challenge; provide STAGING_BEARER_TOKEN for CI or relax CAPTCHA for the staging smoke account."
        : "";
      throw new Error(`Staging smoke account sign-in failed with ${response.status}. ` +
        `Verify the dedicated account credentials and Supabase auth settings.${captchaHint}`);
    }
    return payload.access_token;
  }
  async function request<T = JsonRecord>(method: string, path: string, options: {
    auth?: boolean;
    body?: JsonRecord;
    expected?: number | number[];
  } = {}) {
    const expected = Array.isArray(options.expected)
      ? options.expected
      : [options.expected ?? 200];
    const response = await fetchImpl(`${apiUrl}${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        ...(options.auth === false ? {} : authHeaders),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(requiresStudioOrigin(method, path)
          ? { Origin: stagingStudioOrigin }
          : {}),
      },
      method,
      signal: AbortSignal.timeout(20000),
    });
    const text = (await readBoundedResponse(response, 1024 * 1024)).toString("utf8");
    const payload = text ? parseJson(text, path) : null;
    if (!expected.includes(response.status)) {
      const accessLogError = payload as AccessLogErrorPayload | null;
      if (response.status === 403 &&
        typeof accessLogError?.error === "string" && accessLogError.error.includes("approved Studio Edition origin")) {
        throw new Error(`${method} ${path} rejected staging Studio origin ${stagingStudioOrigin}. ` +
          "Add it to the API STUDIO_WEB_ORIGINS setting or set STAGING_STUDIO_ORIGIN to an approved origin.");
      }
      if (accessLogError?.code === "access_log_schema_drift") {
        throw new Error(`${method} ${path} detected hosted access-log schema drift` +
          ". " +
          "Apply the documented access-log repair migrations.");
      }
      if (path.startsWith("/access-logs") || path.startsWith("/admin/access-logs")) {
        throw new Error(`${method} ${path} failed the hosted access-log storage contract with ${response.status}. ` +
          `Possible schema drift: verify public.access_logs.path, session_id, last_seen_at, access_count, ` +
          "the access_logs_session_id_key index, and public.admin_access_log_summary.");
      }
      if (path === "/me" && response.status === 401) {
        const stagingProject = getSupabaseProjectRef(stagingSupabaseUrl);
        throw new Error(`${method} ${path} returned 401; expected ${expected.join(" or ")}. The smoke signed into Supabase project ${stagingProject || "<unknown>"}, ` +
          "but the hosted API rejected that token. Verify STAGING_API_URL points to the staging API service, " +
          "and that the API service env SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY use the same staging Supabase project. ");
      }
      throw new Error(`${method} ${path} returned ${response.status}; expected ${expected.join(" or ")}.`);
    }
    return {
      payload: payload as T,
      response,
    };
  }
  function parseJson(text: string, path: string) {
    try {
      return JSON.parse(text) as unknown;
    }
    catch {
      throw new Error(`Expected JSON from ${path}.`);
    }
  }
  return { request, resolveBearerToken, getBearerToken: () => bearerToken, setBearerToken(token: string) { bearerToken = token; authHeaders = { Authorization: `Bearer ${token}` }; } };
}
export type StagingClient = ReturnType<typeof createStagingClient>;
export type StagingContext = StagingConfig & StagingClient;
export function createStagingSupabase(url: string, key: string, bearerToken?: string) {
  return createClient(normalizeBaseUrl(url), key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      ...(bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
      fetch: withRequestDeadline(fetch, 20000),
    },
  });
}
