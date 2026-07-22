import type { FastifyInstance } from "fastify";
import { registerSessionCreationRoute } from "./sessionCreationRoute.js";
import { registerSessionLifecycleRoutes } from "./sessionLifecycleRoutes.js";
import {
  createSessionRouteContext,
  type SessionRouteOptions,
} from "./sessionRouteContext.js";

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: SessionRouteOptions = {},
) {
  const context = createSessionRouteContext(options);
  registerSessionCreationRoute(app, context);
  registerSessionLifecycleRoutes(app, context);
}
