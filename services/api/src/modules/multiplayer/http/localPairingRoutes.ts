import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import {
  clearPairing,
  findCurrentPairing,
  savePairing,
} from "../infrastructure/supabasePairingRepository.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type LocalPairingRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

const engineUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Engine URL must use HTTP or HTTPS",
  });
const pairingBodySchema = z.object({ engineUrl: engineUrlSchema });

export async function registerLocalPairingRoutes(
  app: FastifyInstance,
  options: LocalPairingRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.get(
    "/local-pairings/current",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      try {
        const pairing = await findCurrentPairing(service, user.id);
        if (!pairing) return reply.status(404).send({ error: "Local pairing not found" });
        return { pairing };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load local pairing");
        return reply.status(500).send({ error: "Failed to load local pairing" });
      }
    },
  );

  app.post("/local-pairings", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    const body = pairingBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid local pairing" });
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    try {
      const pairing = await savePairing(
        service,
        user.id,
        body.data.engineUrl.replace(/\/$/, ""),
      );
      return reply.status(200).send({ pairing, status: "paired" });
    } catch (error) {
      request.log.error({ err: error }, "Failed to save local pairing");
      return reply.status(500).send({ error: "Failed to save local pairing" });
    }
  });

  app.delete(
    "/local-pairings/current",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      try {
        await clearPairing(service, user.id);
        return reply.status(204).send();
      } catch (error) {
        request.log.error({ err: error }, "Failed to clear local pairing");
        return reply.status(500).send({ error: "Failed to clear local pairing" });
      }
    },
  );
}
