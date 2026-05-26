import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const SESSION_TTL_MS = 15 * 60 * 1000;

const createSessionBodySchema = z.object({
  clientSessionId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  gameId: z.string().uuid(),
  mode: z.enum(["cloud", "local"]).default("cloud"),
});

const sessions = new Map<
  string,
  {
    expiresAt: string;
    gameId: string;
    mode: "cloud" | "local";
    sessionToken: string;
    userId: string;
  }
>();

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createSessionId(clientSessionId?: string) {
  return clientSessionId || crypto.randomUUID();
}

export async function registerSessionRoutes(app: FastifyInstance) {
  app.post(
    "/sessions",
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

      const parsedBody = createSessionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid session request" });
      }

      const { data, error } = await supabaseService
        .from("games")
        .select("rom_url, rom_filename")
        .eq("id", parsedBody.data.gameId)
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: "Game not found" });
      }

      const romTarget = data.rom_url || data.rom_filename;
      if (!romTarget) {
        return reply.status(422).send({ error: "Game has no ROM target" });
      }

      const sessionId = createSessionId(parsedBody.data.clientSessionId);
      const sessionToken = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

      sessions.set(sessionId, {
        expiresAt,
        gameId: parsedBody.data.gameId,
        mode: parsedBody.data.mode,
        sessionToken,
        userId: user.id,
      });

      return {
        boot: {
          romFilename: data.rom_filename || null,
          romUrl: data.rom_url || null,
        },
        engineUrl: "http://localhost:8080",
        expiresAt,
        sessionId,
        sessionToken,
        user: {
          id: user.id,
        },
      };
    },
  );

  app.get(
    "/sessions/:sessionId",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
        .safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }

      const session = sessions.get(params.data.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      return {
        expiresAt: session.expiresAt,
        gameId: session.gameId,
        mode: session.mode,
        sessionId: params.data.sessionId,
      };
    },
  );

  app.delete(
    "/sessions/:sessionId",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
        .safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }

      sessions.delete(params.data.sessionId);
      return reply.status(204).send();
    },
  );
}
