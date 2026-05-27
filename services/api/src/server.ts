import Fastify from "fastify";
import { env } from "./config/env.js";
import { scheduleControlPlaneCleanup } from "./modules/maintenance/controlPlaneCleanup.js";
import { createLoggerOptions } from "./plugins/logger.js";
import { registerCors } from "./plugins/cors.js";
import { registerAccessLogRoutes } from "./routes/accessLogs.js";
import { registerAdminUserRoutes } from "./routes/adminUsers.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerGameRoutes } from "./routes/games.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLocalPairingRoutes } from "./routes/localPairings.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerMetricRoutes } from "./routes/metrics.js";
import { registerModerationRoutes } from "./routes/moderation.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSubmissionRoutes } from "./routes/submissions.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLoggerOptions(),
  });

  await registerCors(app);
  await registerHealthRoutes(app);
  await registerAccessLogRoutes(app);
  await registerCatalogRoutes(app);
  await registerMeRoutes(app);
  await registerProfileRoutes(app);
  await registerAdminUserRoutes(app);
  await registerLocalPairingRoutes(app);
  await registerGameRoutes(app);
  await registerModerationRoutes(app);
  await registerSubmissionRoutes(app);
  await registerSessionRoutes(app);
  await registerMetricRoutes(app);
  scheduleControlPlaneCleanup(app);

  return app;
}

const app = await buildServer();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`Pixelated API listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err, "Failed to start Pixelated API");
  process.exit(1);
}
