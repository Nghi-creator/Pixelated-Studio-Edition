import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getBearerToken,
  requireSupabaseUser,
  supabaseAnon,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

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

type AccessLogRow = {
  first_seen_at: string;
  last_seen_at: string;
  sessions_count: number;
  total_count: number;
  user_id: string | null;
  username: string | null;
};

type SupabaseErrorDetails = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type AccessLogRouteOptions = {
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

export async function registerAccessLogRoutes(
  app: FastifyInstance,
  options: AccessLogRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const anon = options.supabaseAnon === undefined ? supabaseAnon : options.supabaseAnon;

  app.post("/access-logs", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const parsedBody = accessLogBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid access log" });
    }

    let userId: string | null = null;
    const token = getBearerToken(request);
    if (token && anon) {
      const { data, error } = await anon.auth.getUser(token);
      if (!error && data.user) {
        userId = data.user.id;
      }
    }

    const now = new Date().toISOString();
    const { data: existingLog, error: existingLogError } = await service
      .from("access_logs")
      .select("access_count")
      .eq("session_id", parsedBody.data.sessionId)
      .maybeSingle<{ access_count: number | null }>();

    if (existingLogError) {
      request.log.error({ err: existingLogError }, "Failed to load access log session");
      return reply.status(500).send({ error: "Failed to create access log" });
    }

    const { error } = await service.from("access_logs").upsert(
      {
        access_count: (existingLog?.access_count || 0) + 1,
        last_seen_at: now,
        path: parsedBody.data.path,
        session_id: parsedBody.data.sessionId,
        user_id: userId,
      },
      { onConflict: "session_id" },
    );

    if (error) {
      request.log.error({ err: error }, "Failed to create access log");
      return reply.status(500).send({ error: "Failed to create access log" });
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

      const { data: profile, error: profileError } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();
      if (profileError) {
        request.log.error({ err: profileError }, "Failed to load admin profile");
        return reply.status(500).send({
          details: getSupabaseErrorDetails(profileError),
          error: "Failed to authorize logs",
        });
      }
      if (!["admin", "super_admin"].includes(profile?.role || "")) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parsedQuery = accessLogQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid access log query" });
      }

      const { page, pageSize } = parsedQuery.data;
      const { data, error } = await service.rpc("admin_access_log_summary", {
        p_page: page,
        p_page_size: pageSize,
      });

      if (error) {
        request.log.error({ err: error }, "Failed to load access logs");
        return reply.status(500).send({
          details: getSupabaseErrorDetails(error),
          error: "Failed to load access logs",
        });
      }

      const logs = (data || []) as AccessLogRow[];
      const total = logs[0]?.total_count || 0;
      return {
        logs: logs.map((log) => ({
          first_seen_at: log.first_seen_at,
          last_seen_at: log.last_seen_at,
          sessions_count: log.sessions_count,
          user_id: log.user_id,
          username: log.username,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );
}
