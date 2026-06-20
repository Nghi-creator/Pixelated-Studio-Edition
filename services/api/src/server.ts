import Fastify from "fastify";
import { env } from "./config/env.js";
import { scheduleControlPlaneCleanup } from "./modules/maintenance/controlPlaneCleanup.js";
import { createLoggerOptions } from "./plugins/logger.js";
import { registerCors } from "./plugins/cors.js";
import { registerAccessLogRoutes } from "./routes/admin/accessLogs.js";
import { registerAdminUserRoutes } from "./routes/admin/adminUsers.js";
import { registerModerationRoutes } from "./routes/admin/moderation.js";
import { registerAuthMethodsRoutes } from "./routes/auth/authMethods.js";
import { registerMeRoutes } from "./routes/auth/me.js";
import { registerSessionRoutes } from "./routes/auth/sessions.js";
import { registerCatalogRoutes } from "./routes/catalog/catalog.js";
import { registerGameRoutes } from "./routes/catalog/games.js";
import { registerSubmissionRoutes } from "./routes/catalog/submissions.js";
import { registerLocalPairingRoutes } from "./routes/multiplayer/localPairings.js";
import { registerMultiplayerRoutes } from "./routes/multiplayer/multiplayer.js";
import { registerWebRTCRoutes } from "./routes/multiplayer/webrtc.js";
import { registerHealthRoutes } from "./routes/system/health.js";
import { registerMetricRoutes } from "./routes/system/metrics.js";
import { registerProfileRoutes } from "./routes/users/profiles.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLoggerOptions(),
  });

  await registerCors(app);
  await registerHealthRoutes(app);
  await registerAuthMethodsRoutes(app);
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
  await registerMultiplayerRoutes(app);
  await registerWebRTCRoutes(app);
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
