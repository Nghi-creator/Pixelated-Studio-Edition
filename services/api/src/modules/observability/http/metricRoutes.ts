import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createRecordStreamMetric } from "../application/streamMetrics.js";
import {
  requireSupabaseIdentity,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import {
  createRateLimiter,
  type RateLimiter,
} from "../../security/sharedRateLimiter.js";
import { getLiveSession } from "../../auth/infrastructure/backendSessions.js";
import {
  findLatestMetricAt,
  findRecentStreamMetrics,
  insertStreamMetric,
  type StreamMetricRow,
} from "../infrastructure/supabaseMetricRepository.js";

const METRIC_MIN_INTERVAL_MS = 5_000;

const streamMetricSchema = z.object({
  bitrateKbps: z.number().min(0).max(1_000_000).nullable(),
  connectionState: z.enum([
    "new",
    "connecting",
    "connected",
    "disconnected",
    "failed",
    "closed",
  ]),
  fps: z.number().min(0).max(1_000).nullable(),
  iceConnectionState: z.enum([
    "new",
    "checking",
    "connected",
    "completed",
    "failed",
    "disconnected",
    "closed",
  ]),
  jitterMs: z.number().min(0).max(60_000).nullable(),
  packetsLost: z.number().int().min(0).max(1_000_000_000),
  sessionId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  timestamp: z.string().datetime(),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type MetricRouteOptions = {
  hasLiveMetricSession?: (
    sessionId: string,
    userId: string,
  ) => Promise<boolean>;
  metricUserWriteLimiter?: RateLimiter;
  metricWriteLimiter?: RateLimiter;
  requireUser?: typeof requireSupabaseIdentity;
  supabase?: SupabaseServiceLike | null;
};

function mapMetric(row: StreamMetricRow) {
  return {
    bitrateKbps: row.bitrate_kbps,
    connectionState: row.connection_state,
    fps: row.fps,
    iceConnectionState: row.ice_connection_state,
    jitterMs: row.jitter_ms,
    packetsLost: row.packets_lost,
    receivedAt: row.received_at,
    sessionId: row.session_id,
    timestamp: row.metric_timestamp,
  };
}

export async function registerMetricRoutes(
  app: FastifyInstance,
  options: MetricRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseIdentity;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const hasLiveMetricSession =
    options.hasLiveMetricSession ||
    (async (sessionId, userId) => {
      const session = service && (await getLiveSession(service, sessionId));
      return session?.user_id === userId;
    });
  const metricWriteLimiter =
    options.metricWriteLimiter ||
    createRateLimiter({
      limit: 1,
      namespace: "stream-metric-write-user-session",
      windowMs: METRIC_MIN_INTERVAL_MS,
    });
  const metricUserWriteLimiter =
    options.metricUserWriteLimiter ||
    createRateLimiter({
      limit: 30,
      namespace: "stream-metric-write-user",
      windowMs: 60_000,
    });
  const recordMetric = service ? createRecordStreamMetric({
    consumeSession: (key, now) => metricWriteLimiter.consume(key, now),
    consumeUser: (key, now) => metricUserWriteLimiter.consume(key, now),
    findLatest: (userId, sessionId) => findLatestMetricAt(service, userId, sessionId),
    hasLiveSession: hasLiveMetricSession,
    insert: (input) => insertStreamMetric(service, input as Parameters<typeof insertStreamMetric>[1]),
    now: Date.now,
  }) : null;

  app.post(
    "/metrics/stream",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      const parsedMetric = streamMetricSchema.safeParse(request.body);
      if (!parsedMetric.success) {
        return reply.status(400).send({ error: "Invalid stream metric" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      try {
        const result = await recordMetric!(parsedMetric.data, user.id);
        if (result.status === "invalid_timestamp") return reply.status(400).send({ error: "Invalid stream metric timestamp" });
        if (result.status === "missing_session") return reply.status(404).send({ error: "Stream session is not active" });
        if (result.status === "rate_limited") return reply.status(202).send({ accepted: false, reason: "rate_limited" });
        return reply.status(202).send({ accepted: true });
      } catch (error) {
        request.log.error({ err: error }, "Failed to save stream metric");
        return reply.status(500).send({ error: "Failed to save stream metric" });
      }
    },
  );

  app.get(
    "/metrics/stream/recent",
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

      try {
        const metrics = await findRecentStreamMetrics(service, user.id);
        return { metrics: metrics.reverse().map(mapMetric) };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load stream metrics");
        return reply.status(500).send({ error: "Failed to load stream metrics" });
      }
    },
  );
}
