import type { FastifyInstance } from "fastify";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseService } from "../modules/auth/supabaseAuth.js";

const accountMethodsBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type AuthMethodsRouteOptions = {
  supabase?: SupabaseServiceLike | null;
};

const normalizeProviders = (user: User | null | undefined) => {
  const providers = user?.app_metadata?.providers;
  if (!Array.isArray(providers)) return [];

  return providers
    .filter((provider): provider is string => typeof provider === "string")
    .map((provider) => provider.toLowerCase());
};

async function findUserByEmail(
  service: SupabaseServiceLike,
  email: string,
) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    );
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  return null;
}

export async function registerAuthMethodsRoutes(
  app: FastifyInstance,
  options: AuthMethodsRouteOptions = {},
) {
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.post("/auth/account-methods", async (request, reply) => {
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const parsedBody = accountMethodsBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: "Invalid email address" });
    }

    try {
      const user = await findUserByEmail(service, parsedBody.data.email);
      const providers = normalizeProviders(user);

      return {
        exists: Boolean(user),
        hasEmailProvider: providers.includes("email"),
        providers,
      };
    } catch (err) {
      request.log.error({ err }, "Failed to inspect auth account methods");
      return reply.status(500).send({ error: "Failed to inspect auth methods" });
    }
  });
}
