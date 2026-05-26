import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSupabaseUser } from "../modules/auth/supabaseAuth.js";

const localPairings = new Map<
  string,
  {
    createdAt: string;
    engineUrl: string;
    pairingId: string;
    tokenStoredBy: "browser-local-storage";
    updatedAt: string;
  }
>();

const pairingBodySchema = z.object({
  engineUrl: z.string().url(),
});

export async function registerLocalPairingRoutes(app: FastifyInstance) {
  app.get(
    "/local-pairings/current",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      const pairing = localPairings.get(user.id);
      if (!pairing) {
        return reply.status(404).send({ error: "Local pairing not found" });
      }

      return { pairing };
    },
  );

  app.post(
    "/local-pairings",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      const parsedBody = pairingBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid local pairing" });
      }

      const existing = localPairings.get(user.id);
      const now = new Date().toISOString();
      const pairing = {
        createdAt: existing?.createdAt || now,
        engineUrl: parsedBody.data.engineUrl.replace(/\/$/, ""),
        pairingId: existing?.pairingId || crypto.randomUUID(),
        tokenStoredBy: "browser-local-storage" as const,
        updatedAt: now,
      };

      localPairings.set(user.id, pairing);

      return reply.status(existing ? 200 : 201).send({
        pairing,
        status: "paired",
      });
    },
  );

  app.delete(
    "/local-pairings/current",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      localPairings.delete(user.id);
      return reply.status(204).send();
    },
  );
}
