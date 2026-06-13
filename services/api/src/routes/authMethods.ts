import type { FastifyInstance } from "fastify";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseService } from "../modules/auth/supabaseAuth.js";
import { FixedWindowRateLimiter } from "../modules/security/fixedWindowRateLimiter.js";

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
  const accountLookupIpLimiter = new FixedWindowRateLimiter({
    limit: 300,
    windowMs: 60_000,
  });
  const accountLookupEmailLimiter = new FixedWindowRateLimiter({
    limit: 10,
    windowMs: 60_000,
  });

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

    const rateLimits = [
      accountLookupIpLimiter.consume(request.ip),
      accountLookupEmailLimiter.consume(parsedBody.data.email.toLowerCase()),
    ];
    const blockedRateLimit = rateLimits.find((result) => !result.allowed);
    if (blockedRateLimit) {
      reply.header(
        "Retry-After",
        Math.max(1, Math.ceil((blockedRateLimit.resetAt - Date.now()) / 1000)),
      );
      return reply.status(429).send({
        error: "Too many account lookup attempts. Please try again shortly.",
      });
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
