import type { FastifyInstance } from "fastify";
import { env, sharedRateLimitStoreConfigured } from "../../../config/env.js";
import { supabaseService } from "../../auth/supabaseAuth.js";

const startedAt = Date.now();

type ReadinessConfiguration = {
  sharedRateLimitStoreConfigured: boolean;
  sharedRateLimitStoreRequired: boolean;
  supabaseConfigured: boolean;
  webOriginsConfigured: boolean;
};

export type ReadinessOptions = {
  checkRateLimitStore?: () => Promise<boolean>;
  checkSupabase?: () => Promise<boolean>;
  configuration?: ReadinessConfiguration;
};

async function withDeadline(
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      check().catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkSupabase(): Promise<boolean> {
  if (!supabaseService) return false;
  const { error } = await supabaseService.from("games").select("id").limit(1);
  return !error;
}

async function checkRateLimitStore(): Promise<boolean> {
  if (!env.RATE_LIMIT_REDIS_REST_URL || !env.RATE_LIMIT_REDIS_REST_TOKEN) {
    return false;
  }
  const response = await fetch(
    env.RATE_LIMIT_REDIS_REST_URL.replace(/\/+$/, ""),
    {
      body: JSON.stringify(["PING"]),
      headers: {
        authorization: `Bearer ${env.RATE_LIMIT_REDIS_REST_TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(env.RATE_LIMIT_REDIS_TIMEOUT_MS),
    },
  );
  if (!response.ok) return false;
  const body = (await response.json()) as { result?: unknown };
  return body.result === "PONG";
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: ReadinessOptions = {},
) {
  app.get("/", async (_request, reply) =>
    reply.type("text/plain").send("API is awake!"),
  );

  app.get("/health", async () => ({
    ok: true,
    service: "pixelated-api",
    environment: env.NODE_ENV,
    rateLimitStore: sharedRateLimitStoreConfigured ? "redis" : "memory",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get("/ready", async (_request, reply) => {
    const configuration = options.configuration || {
      sharedRateLimitStoreConfigured,
      sharedRateLimitStoreRequired: env.NODE_ENV === "production",
      supabaseConfigured: Boolean(
        env.SUPABASE_URL &&
          env.SUPABASE_ANON_KEY &&
          env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      webOriginsConfigured: env.allowedOrigins.length > 0,
    };
    const [supabaseReachable, sharedRateLimitStoreReachable] =
      await Promise.all([
        configuration.supabaseConfigured
          ? withDeadline(
              options.checkSupabase || checkSupabase,
              env.RATE_LIMIT_REDIS_TIMEOUT_MS,
            )
          : Promise.resolve(false),
        configuration.sharedRateLimitStoreConfigured
          ? withDeadline(
              options.checkRateLimitStore || checkRateLimitStore,
              env.RATE_LIMIT_REDIS_TIMEOUT_MS,
            )
          : Promise.resolve(!configuration.sharedRateLimitStoreRequired),
      ]);
    const checks = {
      sharedRateLimitStoreConfigured:
        !configuration.sharedRateLimitStoreRequired ||
        configuration.sharedRateLimitStoreConfigured,
      sharedRateLimitStoreReachable,
      supabaseConfigured: configuration.supabaseConfigured,
      supabaseReachable,
      webOrigins: configuration.webOriginsConfigured,
    };
    const ok = Object.values(checks).every(Boolean);

    return reply.status(ok ? 200 : 503).send({
      ok,
      service: "pixelated-api",
      environment: env.NODE_ENV,
      checks,
    });
  });
}
