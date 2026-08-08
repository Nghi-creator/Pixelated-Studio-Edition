import { env } from "../../../config/env.js";
import { supabaseService } from "../../auth/infrastructure/supabaseClients.js";

export async function checkSupabaseReadiness() {
  if (!supabaseService) return false;
  const { error } = await supabaseService.from("games").select("id").limit(1);
  return !error;
}

export async function checkRateLimitStoreReadiness() {
  if (!env.RATE_LIMIT_REDIS_REST_URL || !env.RATE_LIMIT_REDIS_REST_TOKEN) return false;
  const response = await fetch(env.RATE_LIMIT_REDIS_REST_URL.replace(/\/+$/, ""), {
    body: JSON.stringify(["PING"]),
    headers: {
      authorization: `Bearer ${env.RATE_LIMIT_REDIS_REST_TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(env.RATE_LIMIT_REDIS_TIMEOUT_MS),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { result?: unknown };
  return body.result === "PONG";
}
