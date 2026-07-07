import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type MultiplayerRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

type MultiplayerLobbyRow = {
  created_at: string;
  engine_url: string | null;
  exposure_mode: "lan" | "local" | "unknown";
  game_id: string;
  host_user_id: string;
  id: string;
  max_players: number;
  participants: unknown;
  session_id: string;
  status: "active" | "ended";
  updated_at: string;
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

function mapLobby(row: MultiplayerLobbyRow) {
  return {
    createdAt: row.created_at,
    engineUrl: row.engine_url,
    exposureMode: row.exposure_mode,
    gameId: row.game_id,
    hostUserId: row.host_user_id,
    lobbyId: row.id,
    maxPlayers: row.max_players,
    participants: row.participants,
    sessionId: row.session_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

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
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = z
        .object({ sessionId: sessionIdSchema })
        .safeParse(request.params);
      const body = lobbyBodySchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid multiplayer lobby" });
      }

      const now = new Date().toISOString();
      const engineUrl = body.data.engineUrl
        ? body.data.engineUrl.replace(/\/$/, "")
        : null;

      const { data, error } = await service
        .from("multiplayer_lobbies")
        .upsert(
          {
            engine_url: engineUrl,
            exposure_mode: body.data.exposureMode,
            game_id: body.data.gameId,
            host_user_id: user.id,
            max_players: body.data.maxPlayers,
            participants: body.data.participants,
            session_id: params.data.sessionId,
            status: "active",
            updated_at: now,
          },
          { onConflict: "host_user_id,session_id" },
        )
        .select(
          "id,host_user_id,session_id,game_id,engine_url,exposure_mode,status,max_players,participants,created_at,updated_at",
        )
        .single<MultiplayerLobbyRow>();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to save multiplayer lobby");
        return reply
          .status(500)
          .send({ error: "Failed to save multiplayer lobby" });
      }

      return reply.status(200).send({ lobby: mapLobby(data) });
    },
  );

  app.get(
    "/multiplayer/lobbies/recent",
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
        .from("multiplayer_lobbies")
        .select(
          "id,host_user_id,session_id,game_id,engine_url,exposure_mode,status,max_players,participants,created_at,updated_at",
        )
        .eq("host_user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(10)
        .returns<MultiplayerLobbyRow[]>();

      if (error) {
        request.log.error({ err: error }, "Failed to load multiplayer lobbies");
        return reply
          .status(500)
          .send({ error: "Failed to load multiplayer lobbies" });
      }

      return { lobbies: (data || []).map(mapLobby) };
    },
  );

  app.delete(
    "/multiplayer/lobbies/:sessionId",
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

      const params = z
        .object({ sessionId: sessionIdSchema })
        .safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }

      const { error } = await service
        .from("multiplayer_lobbies")
        .update({ status: "ended", updated_at: new Date().toISOString() })
        .eq("host_user_id", user.id)
        .eq("session_id", params.data.sessionId);
      if (error) {
        request.log.error({ err: error }, "Failed to end multiplayer lobby");
        return reply.status(500).send({ error: "Failed to end multiplayer lobby" });
      }

      return reply.status(204).send();
    },
  );
}
