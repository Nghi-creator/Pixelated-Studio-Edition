import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const userParamsSchema = z.object({ userId: z.string().uuid() });
const userUpdateSchema = z
  .object({
    is_banned: z.boolean().optional(),
    role: z.enum(["admin", "user"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.is_banned !== undefined);

type ProfileRole = {
  role: string | null;
};

function isSuperAdminRole(role: string | null | undefined) {
  return role === "super_admin";
}

async function requireSuperAdmin(userId: string) {
  if (!supabaseService) return false;

  const { data, error } = await supabaseService
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRole>();

  if (error) throw error;
  return isSuperAdminRole(data?.role);
}

export async function registerAdminUserRoutes(app: FastifyInstance) {
  app.get(
    "/admin/users",
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

      if (!(await requireSuperAdmin(user.id))) {
        return reply.status(403).send({ error: "Super admin access required" });
      }

      const { data, error } = await supabaseService
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        request.log.error({ err: error }, "Failed to load users");
        return reply.status(500).send({ error: "Failed to load users" });
      }

      return { users: data || [] };
    },
  );

  app.patch(
    "/admin/users/:userId",
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

      if (!(await requireSuperAdmin(user.id))) {
        return reply.status(403).send({ error: "Super admin access required" });
      }

      const params = userParamsSchema.safeParse(request.params);
      const body = userUpdateSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid user update" });
      }

      if (params.data.userId === user.id) {
        return reply.status(403).send({ error: "Cannot modify yourself" });
      }

      const { data: target } = await supabaseService
        .from("profiles")
        .select("role")
        .eq("id", params.data.userId)
        .maybeSingle<ProfileRole>();
      if (target?.role === "super_admin") {
        return reply.status(403).send({ error: "Cannot modify super admins" });
      }

      const { data, error } = await supabaseService
        .from("profiles")
        .update(body.data)
        .eq("id", params.data.userId)
        .select()
        .single();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to update user");
        return reply.status(500).send({ error: "Failed to update user" });
      }

      return { user: data };
    },
  );
}
