import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getBearerToken,
  requireSupabaseUser,
  supabaseAnon,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const accessLogBodySchema = z.object({
  path: z.string().trim().min(1).max(2048),
});

export async function registerAccessLogRoutes(app: FastifyInstance) {
  app.post("/access-logs", async (request, reply) => {
    if (!supabaseService) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const parsedBody = accessLogBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid access log" });
    }

    let userId: string | null = null;
    const token = getBearerToken(request);
    if (token && supabaseAnon) {
      const { data, error } = await supabaseAnon.auth.getUser(token);
      if (!error && data.user) {
        userId = data.user.id;
      }
    }

    const { error } = await supabaseService.from("access_logs").insert({
      path: parsedBody.data.path,
      user_id: userId,
    });

    if (error) {
      request.log.error({ err: error }, "Failed to create access log");
      return reply.status(500).send({ error: "Failed to create access log" });
    }

    return reply.status(202).send({ success: true });
  });

  app.get(
    "/admin/access-logs",
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

      const { data: profile, error: profileError } = await supabaseService
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();
      if (profileError) {
        request.log.error({ err: profileError }, "Failed to load admin profile");
        return reply.status(500).send({ error: "Failed to authorize logs" });
      }
      if (!["admin", "super_admin"].includes(profile?.role || "")) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { data, error } = await supabaseService
        .from("access_logs")
        .select("id,created_at,user_id,path,profiles(username)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        request.log.error({ err: error }, "Failed to load access logs");
        return reply.status(500).send({ error: "Failed to load access logs" });
      }

      return { logs: data || [] };
    },
  );
}
