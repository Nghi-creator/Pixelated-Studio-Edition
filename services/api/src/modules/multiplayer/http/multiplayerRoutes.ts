import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import {
  endLobby,
  findRecentLobbies,
  saveLobby,
} from "../infrastructure/supabaseLobbyRepository.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type MultiplayerRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80);
const engineUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Engine URL must use HTTP or HTTPS",
  });
const participantSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  playerIndex: z.number().int().min(1).max(4).nullable(),
  role: z.enum(["host", "player", "spectator"]),
});
const lobbyBodySchema = z.object({
  engineUrl: engineUrlSchema.optional().nullable(),
  exposureMode: z.enum(["lan", "local", "unknown"]).default("unknown"),
  gameId: z.string().min(1).max(200),
  maxPlayers: z.number().int().min(1).max(4),
  participants: z.array(participantSchema).max(16),
});

export async function registerMultiplayerRoutes(
  app: FastifyInstance,
  options: MultiplayerRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.put(
    "/multiplayer/lobbies/:sessionId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = z.object({ sessionId: sessionIdSchema }).safeParse(request.params);
      const body = lobbyBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid multiplayer lobby" });
      }

      try {
        const lobby = await saveLobby(service, {
          ...body.data,
          engineUrl: body.data.engineUrl?.replace(/\/$/, "") || null,
          hostUserId: user.id,
          sessionId: params.data.sessionId,
        });
        return reply.status(200).send({ lobby });
      } catch (error) {
        request.log.error({ err: error }, "Failed to save multiplayer lobby");
        return reply.status(500).send({ error: "Failed to save multiplayer lobby" });
      }
    },
  );

  app.get(
    "/multiplayer/lobbies/recent",
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
        return { lobbies: await findRecentLobbies(service, user.id) };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load multiplayer lobbies");
        return reply.status(500).send({ error: "Failed to load multiplayer lobbies" });
      }
    },
  );

  app.delete(
    "/multiplayer/lobbies/:sessionId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = z.object({ sessionId: sessionIdSchema }).safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid session id" });

      try {
        await endLobby(service, user.id, params.data.sessionId);
        return reply.status(204).send();
      } catch (error) {
        request.log.error({ err: error }, "Failed to end multiplayer lobby");
        return reply.status(500).send({ error: "Failed to end multiplayer lobby" });
      }
    },
  );
}
