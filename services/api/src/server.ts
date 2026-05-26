import Fastify from "fastify";
import { env } from "./config/env.js";
import { createLoggerOptions } from "./plugins/logger.js";
import { registerCors } from "./plugins/cors.js";
import { registerGameRoutes } from "./routes/games.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLocalPairingRoutes } from "./routes/localPairings.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerMetricRoutes } from "./routes/metrics.js";
import { registerModerationRoutes } from "./routes/moderation.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export async function buildServer() {
  const app = Fastify({
    logger: createLoggerOptions(),
  });

  await registerCors(app);
  await registerHealthRoutes(app);
  await registerMeRoutes(app);
  await registerLocalPairingRoutes(app);
  await registerGameRoutes(app);
  await registerModerationRoutes(app);
  await registerSessionRoutes(app);
  await registerMetricRoutes(app);

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
