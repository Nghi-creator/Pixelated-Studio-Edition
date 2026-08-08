import type { FastifyInstance } from "fastify";
import {
  requireSupabaseUser,
  supabaseService,
} from "./supabaseAuth.js";
import { createGetPermissions } from "../application/getPermissions.js";
import { findProfilePermissions } from "../infrastructure/supabasePermissionsRepository.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type MeRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

export async function registerMeRoutes(
  app: FastifyInstance,
  options: MeRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const getPermissions = createGetPermissions({
    findProfile: (userId) => findProfilePermissions(service, userId),
  });

  app.get("/me", { preHandler: requireUser }, async (request) => {
    const user = request.user;

    return {
      user: {
        id: user?.id,
        email: user?.email ?? null,
      },
    };
  });

  app.get(
    "/me/permissions",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      try {
        return await getPermissions(user);
      } catch (err) {
        request.log.error(err, "Failed to load user permissions");
        return reply.status(500).send({
          error: "Failed to load user permissions",
        });
      }
    },
  );
}
