import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";

type LocalPairingRow = {
  created_at: string;
  engine_url: string;
  id: string;
  token_stored_by: "browser-local-storage";
  updated_at: string;
};

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

const pairingBodySchema = z.object({
  engineUrl: engineUrlSchema,
});

function mapPairing(row: LocalPairingRow) {
  return {
    createdAt: row.created_at,
    engineUrl: row.engine_url,
    pairingId: row.id,
    tokenStoredBy: row.token_stored_by,
    updatedAt: row.updated_at,
  };
}

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
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { data, error } = await service
        .from("local_engine_pairings")
        .select("id,engine_url,token_stored_by,created_at,updated_at")
        .eq("user_id", user.id)
        .maybeSingle<LocalPairingRow>();

      if (error) {
        request.log.error({ err: error }, "Failed to load local pairing");
        return reply.status(500).send({ error: "Failed to load local pairing" });
      }

      const pairing = data ? mapPairing(data) : null;
      if (!pairing) {
        return reply.status(404).send({ error: "Local pairing not found" });
      }

      return { pairing };
    },
  );

  app.post(
    "/local-pairings",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      const parsedBody = pairingBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid local pairing" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const now = new Date().toISOString();
      const engineUrl = parsedBody.data.engineUrl.replace(/\/$/, "");

      const { data, error } = await service
        .from("local_engine_pairings")
        .upsert(
          {
            engine_url: engineUrl,
            token_stored_by: "browser-local-storage",
            updated_at: now,
            user_id: user.id,
          },
          { onConflict: "user_id" },
        )
        .select("id,engine_url,token_stored_by,created_at,updated_at")
        .single<LocalPairingRow>();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to save local pairing");
        return reply.status(500).send({ error: "Failed to save local pairing" });
      }

      return reply.status(200).send({
        pairing: mapPairing(data),
        status: "paired",
      });
    },
  );

  app.delete(
    "/local-pairings/current",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const { error } = await service
        .from("local_engine_pairings")
        .delete()
        .eq("user_id", user.id);
      if (error) {
        request.log.error({ err: error }, "Failed to clear local pairing");
        return reply.status(500).send({ error: "Failed to clear local pairing" });
      }
      return reply.status(204).send();
    },
  );
}
