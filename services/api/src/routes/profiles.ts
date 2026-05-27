import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const profileUpdateSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  username: z.string().trim().min(1).max(80),
});

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get(
    "/profile",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { data, error } = await supabaseService
        .from("profiles")
        .select("username, avatar_url, role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "Failed to load profile");
        return reply.status(500).send({ error: "Failed to load profile" });
      }

      return { profile: data || null };
    },
  );

  app.patch(
    "/profile",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const body = profileUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid profile update" });
      }

      const { error } = await supabaseService
        .from("profiles")
        .update({
          avatar_url: body.data.avatarUrl || null,
          username: body.data.username,
        })
        .eq("id", user.id);

      if (error) {
        request.log.error({ err: error }, "Failed to update profile");
        return reply.status(500).send({ error: "Failed to update profile" });
      }

      return { success: true };
    },
  );

  app.delete(
    "/me/account",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { error } = await supabaseService.auth.admin.deleteUser(user.id);
      if (error) {
        request.log.error({ err: error }, "Failed to delete account");
        return reply.status(500).send({ error: "Failed to delete account" });
      }

      return reply.status(204).send();
    },
  );
}
