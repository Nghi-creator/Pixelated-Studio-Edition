import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAccessLogUseCases } from "../application/accessLogs.js";
import {
  getBearerToken,
  requireSupabaseUser,
  supabaseAnon,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { getAuthoritativeUserRole } from "../../auth/infrastructure/roleAuthorization.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  findAccessLogSummary,
  findTokenUserId,
  recordAccessLog,
} from "../infrastructure/supabaseAccessLogRepository.js";
import { logTiming, timed } from "../infrastructure/timing.js";

const accessLogBodySchema = z.object({
  path: z.string().trim().min(1).max(2048),
  sessionId: z.string().trim().min(12).max(128),
});

const accessLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type SupabaseAnonLike = NonNullable<typeof supabaseAnon>;

type SupabaseErrorDetails = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type AccessLogStorageErrorResponse = {
  code?: "access_log_schema_drift";
  details?: SupabaseErrorDetails;
  error: string;
  migrations?: string[];
};

type AccessLogRouteOptions = {
  accessLogWriteLimiter?: RateLimiter;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
  supabaseAnon?: SupabaseAnonLike | null;
};

function getSupabaseErrorDetails(error: unknown): SupabaseErrorDetails | undefined {
  if (!error || typeof error !== "object") return undefined;

  const supabaseError = error as SupabaseErrorDetails;
  return {
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    message: supabaseError.message,
  };
}

const ACCESS_LOG_SCHEMA_ERROR_CODES = new Set([
  "42703",
  "42883",
  "42P01",
  "42P10",
  "PGRST202",
  "PGRST204",
]);

export function getAccessLogStorageErrorResponse(
  error: unknown,
  message: string,
): AccessLogStorageErrorResponse {
  const details = getSupabaseErrorDetails(error);
  if (details?.code && ACCESS_LOG_SCHEMA_ERROR_CODES.has(details.code)) {
    return {
      code: "access_log_schema_drift",
      details,
      error: message,
      migrations: [
        "20260603090000_repair_access_logs_path.sql",
        "20260604090000_access_log_sessions_summary.sql",
        "20260718133000_atomic_activity_and_smoke_writes.sql",
      ],
    };
  }

  return { error: message };
}

export async function registerAccessLogRoutes(
  app: FastifyInstance,
  options: AccessLogRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const anon = options.supabaseAnon === undefined ? supabaseAnon : options.supabaseAnon;
  const accessLogWriteLimiter =
    options.accessLogWriteLimiter ||
    createRateLimiter({
      limit: 120,
      namespace: "access-log-write-ip",
      windowMs: 60_000,
    });
  const useCases = service ? createAccessLogUseCases({
    authorize: async (userId, timings) => {
      const lookup = await timed(timings, "admin_role_check_ms", () =>
        getAuthoritativeUserRole(service, userId),
      );
      if (lookup.error) throw lookup.error;
      return ["admin", "super_admin"].includes(lookup.role || "");
    },
    findSummary: (page, pageSize, timings) =>
      timed(timings, "access_log_summary_rpc_ms", () =>
        findAccessLogSummary(service, page, pageSize),
      ),
    findTokenUser: (token, timings) => anon
      ? timed(timings, "auth_user_lookup_ms", () => findTokenUserId(anon, token))
      : Promise.resolve(null),
    record: (input, timings) => timed(timings, "access_log_upsert_ms", () =>
      recordAccessLog(service, input),
    ),
  }) : null;

  app.post("/access-logs", async (request, reply) => {
    if (
      rejectRateLimitedRequest(
        reply,
        await accessLogWriteLimiter.consume(request.ip),
        "Access-log rate limit reached. Please try again shortly.",
      )
    ) {
      return;
    }

    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const parsedBody = accessLogBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid access log" });
    }

    const token = getBearerToken(request);
    const timings = {};
    try {
      const result = await useCases!.record({
        ...parsedBody.data,
        timings,
        token: token || undefined,
      });
      logTiming(request.log, "Access log write timing", timings, {
        authenticated: result.authenticated,
      });
    } catch (error) {
      request.log.error({ err: error }, "Failed to create access log");
      return reply
        .status(500)
        .send(getAccessLogStorageErrorResponse(error, "Failed to create access log"));
    }

    return reply.status(202).send({ success: true });
  });

  app.get(
    "/admin/access-logs",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedQuery = accessLogQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid access log query" });
      }

      try {
        const timings = {};
        const result = await useCases!.list({
          ...parsedQuery.data,
          timings,
          userId: user.id,
        });
        if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
        logTiming(request.log, "Admin access logs timing", timings, {
          page: result.page,
          pageSize: result.pageSize,
          resultCount: result.logs.length,
          roleSource: "database",
          total: result.total,
        });
        return { logs: result.logs, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load access logs");
        return reply
          .status(500)
          .send(getAccessLogStorageErrorResponse(error, "Failed to load access logs"));
      }
    },
  );
}
