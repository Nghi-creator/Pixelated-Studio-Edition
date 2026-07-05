import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { supabaseService } from "../auth/supabaseAuth.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type CleanupOptions = {
  metricRetentionDays?: number;
  now?: Date;
  supabase?: SupabaseServiceLike | null;
};

export async function cleanupControlPlaneState(
  app: FastifyInstance,
  options: CleanupOptions = {},
) {
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  if (!service) {
    app.log.warn("Skipping control-plane cleanup: Supabase service unavailable");
    return;
  }

  const now = options.now || new Date();
  const retentionDays =
    options.metricRetentionDays || env.STREAM_METRIC_RETENTION_DAYS;
  const metricCutoff = new Date(
    now.getTime() - retentionDays * MS_PER_DAY,
  ).toISOString();

  const { error: expiredSessionError } = await service
    .from("backend_sessions")
    .delete()
    .lt("expires_at", now.toISOString());

  if (expiredSessionError) {
    app.log.error(
      { err: expiredSessionError },
      "Failed to delete expired backend sessions",
    );
  }

  const { error: deletedSessionError } = await service
    .from("backend_sessions")
    .delete()
    .not("deleted_at", "is", null);

  if (deletedSessionError) {
    app.log.error(
      { err: deletedSessionError },
      "Failed to delete stopped backend sessions",
    );
  }

  const { error: metricError } = await service
    .from("stream_metrics")
    .delete()
    .lt("received_at", metricCutoff);

  if (metricError) {
    app.log.error({ err: metricError }, "Failed to delete old stream metrics");
  }
}

export function scheduleControlPlaneCleanup(app: FastifyInstance) {
  app.addHook("onListen", () => {
    void cleanupControlPlaneState(app);
  });

  const timer = setInterval(() => {
    void cleanupControlPlaneState(app);
  }, env.CONTROL_PLANE_CLEANUP_INTERVAL_MS);

  timer.unref();

  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
}
