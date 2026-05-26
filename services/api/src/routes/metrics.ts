import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSupabaseUser } from "../modules/auth/supabaseAuth.js";

const METRIC_MIN_INTERVAL_MS = 5_000;
const MAX_RECENT_METRICS = 500;

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
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  timestamp: z.string().datetime(),
});

type StreamMetric = z.infer<typeof streamMetricSchema> & {
  receivedAt: string;
  userId: string;
};

const recentMetrics: StreamMetric[] = [];
const lastMetricByUserSession = new Map<string, number>();

export async function registerMetricRoutes(app: FastifyInstance) {
  app.post(
    "/metrics/stream",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      const parsedMetric = streamMetricSchema.safeParse(request.body);
      if (!parsedMetric.success) {
        return reply.status(400).send({ error: "Invalid stream metric" });
      }

      const key = `${user.id}:${parsedMetric.data.sessionId}`;
      const now = Date.now();
      const lastMetricAt = lastMetricByUserSession.get(key) || 0;

      if (now - lastMetricAt < METRIC_MIN_INTERVAL_MS) {
        return reply.status(202).send({
          accepted: false,
          reason: "rate_limited",
        });
      }

      lastMetricByUserSession.set(key, now);
      recentMetrics.push({
        ...parsedMetric.data,
        receivedAt: new Date(now).toISOString(),
        userId: user.id,
      });

      if (recentMetrics.length > MAX_RECENT_METRICS) {
        recentMetrics.splice(0, recentMetrics.length - MAX_RECENT_METRICS);
      }

      return reply.status(202).send({ accepted: true });
    },
  );

  app.get(
    "/metrics/stream/recent",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      return {
        metrics: recentMetrics
          .filter((metric) => metric.userId === user.id)
          .slice(-50),
      };
    },
  );
}
