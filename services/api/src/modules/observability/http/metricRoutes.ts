import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";

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
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  timestamp: z.string().datetime(),
});

type StreamMetricRow = {
  bitrate_kbps: number | null;
  connection_state: string;
  fps: number | null;
  ice_connection_state: string;
  jitter_ms: number | null;
  metric_timestamp: string;
  packets_lost: number;
  received_at: string;
  session_id: string;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type MetricRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
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
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

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

      const now = Date.now();
      const { data: latestMetric, error: latestMetricError } =
        await service
          .from("stream_metrics")
          .select("received_at")
          .eq("user_id", user.id)
          .eq("session_id", parsedMetric.data.sessionId)
          .order("received_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ received_at: string }>();

      if (latestMetricError) {
        request.log.error(
          { err: latestMetricError },
          "Failed to read latest stream metric",
        );
        return reply.status(500).send({ error: "Failed to save stream metric" });
      }

      const lastMetricAt = latestMetric
        ? Date.parse(latestMetric.received_at)
        : 0;
      if (now - lastMetricAt < METRIC_MIN_INTERVAL_MS) {
        return reply.status(202).send({
          accepted: false,
          reason: "rate_limited",
        });
      }

      const { error } = await service.from("stream_metrics").insert({
        bitrate_kbps: parsedMetric.data.bitrateKbps,
        connection_state: parsedMetric.data.connectionState,
        fps: parsedMetric.data.fps,
        ice_connection_state: parsedMetric.data.iceConnectionState,
        jitter_ms: parsedMetric.data.jitterMs,
        metric_timestamp: parsedMetric.data.timestamp,
        packets_lost: parsedMetric.data.packetsLost,
        received_at: new Date(now).toISOString(),
        session_id: parsedMetric.data.sessionId,
        user_id: user.id,
      });

      if (error) {
        request.log.error({ err: error }, "Failed to save stream metric");
        return reply.status(500).send({ error: "Failed to save stream metric" });
      }

      return reply.status(202).send({ accepted: true });
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

      const { data, error } = await service
        .from("stream_metrics")
        .select(
          "session_id,fps,bitrate_kbps,packets_lost,jitter_ms,ice_connection_state,connection_state,metric_timestamp,received_at",
        )
        .eq("user_id", user.id)
        .order("received_at", { ascending: false })
        .limit(50)
        .returns<StreamMetricRow[]>();

      if (error) {
        request.log.error({ err: error }, "Failed to load stream metrics");
        return reply.status(500).send({ error: "Failed to load stream metrics" });
      }

      return {
        metrics: (data || []).reverse().map(mapMetric),
      };
    },
  );
}
