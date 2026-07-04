import Fastify from "fastify";
import { env } from "./config/env.js";
import { scheduleControlPlaneCleanup } from "./modules/maintenance/controlPlaneCleanup.js";
import { createLoggerOptions } from "./plugins/logger.js";
import { registerCors } from "./plugins/cors.js";
import { registerGlobalRateLimit } from "./plugins/rateLimit.js";
import { registerSecurityHeaders } from "./plugins/securityHeaders.js";
import { registerAccessLogRoutes } from "./modules/observability/http/accessLogRoutes.js";
import { registerAdminUserRoutes } from "./modules/users/http/adminUserRoutes.js";
import { registerAdminSubmissionRoutes } from "./modules/catalog/http/adminSubmissionRoutes.js";
import { registerCatalogCandidateRoutes } from "./modules/catalog/http/catalogCandidateRoutes.js";
import { registerModerationRoutes } from "./modules/moderation/http/registerModerationRoutes.js";
import { registerAuthMethodsRoutes } from "./modules/auth/http/authMethodsRoutes.js";
import { registerMeRoutes } from "./modules/auth/http/meRoutes.js";
import { registerSessionRoutes } from "./modules/auth/http/sessionRoutes.js";
import { registerCatalogRoutes } from "./modules/catalog/http/registerCatalogRoutes.js";
import { registerPlayCountRoutes } from "./modules/catalog/http/playCountRoutes.js";
import { registerSubmissionRoutes } from "./modules/catalog/http/registerSubmissionRoutes.js";
import { registerLocalPairingRoutes } from "./modules/multiplayer/http/localPairingRoutes.js";
import { registerMultiplayerRoutes } from "./modules/multiplayer/http/multiplayerRoutes.js";
import { registerWebRTCRoutes } from "./modules/multiplayer/http/webrtcRoutes.js";
import { registerHealthRoutes } from "./modules/system/http/healthRoutes.js";
import { registerMetricRoutes } from "./modules/observability/http/metricRoutes.js";
import { registerProfileRoutes } from "./modules/users/http/profileRoutes.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLoggerOptions(),
    trustProxy: env.trustProxy,
  });

  await registerSecurityHeaders(app);
  await registerCors(app);
  await registerGlobalRateLimit(app);
  await registerHealthRoutes(app);
  await registerAuthMethodsRoutes(app);
  await registerAccessLogRoutes(app);
  await registerCatalogCandidateRoutes(app);
  await registerCatalogRoutes(app);
  await registerMeRoutes(app);
  await registerProfileRoutes(app);
  await registerAdminSubmissionRoutes(app);
  await registerAdminUserRoutes(app);
  await registerLocalPairingRoutes(app);
  await registerPlayCountRoutes(app);
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
