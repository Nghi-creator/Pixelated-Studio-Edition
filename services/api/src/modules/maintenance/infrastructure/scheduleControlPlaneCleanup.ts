import type { FastifyInstance } from "fastify";
import { env } from "../../../config/env.js";
import { supabaseService } from "../../auth/infrastructure/supabaseClients.js";
import {
  deleteExpiredSessions,
  deleteOldMetrics,
  deleteStoppedSessions,
} from "./supabaseControlPlaneCleanup.js";
import { runControlPlaneCleanup } from "../application/cleanupControlPlaneState.js";

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

  const { deletedSessionError, expiredSessionError, metricError } =
    await runControlPlaneCleanup({
      deleteExpiredSessions: (now) => deleteExpiredSessions(service, now),
      deleteOldMetrics: (cutoff) => deleteOldMetrics(service, cutoff),
      deleteStoppedSessions: () => deleteStoppedSessions(service),
      metricRetentionDays:
        options.metricRetentionDays || env.STREAM_METRIC_RETENTION_DAYS,
      now: options.now || new Date(),
    });

  if (expiredSessionError) {
    app.log.error(
      { err: expiredSessionError },
      "Failed to delete expired backend sessions",
    );
  }

  if (deletedSessionError) {
    app.log.error(
      { err: deletedSessionError },
      "Failed to delete stopped backend sessions",
    );
  }

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
