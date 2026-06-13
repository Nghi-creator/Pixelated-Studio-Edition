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

type BackendSessionRow = {
  boot_rom_filename: string | null;
  boot_rom_url: string | null;
  deleted_at: string | null;
  expires_at: string;
  game_id: string;
  id: string;
  mode: "cloud" | "local";
  session_token_hash: string;
  user_id: string;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type SessionRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createSessionId(clientSessionId?: string) {
  return clientSessionId || crypto.randomUUID();
}

function hashSessionToken(sessionToken: string) {
  return crypto.createHash("sha256").update(sessionToken).digest("hex");
}

function sessionTokenMatches(storedHash: string, sessionToken: string) {
  const candidateHash = hashSessionToken(sessionToken);
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");

  return (
    stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate)
  );
}

function mapBoot(row: BackendSessionRow) {
  return {
    romFilename: row.boot_rom_filename,
    romUrl: row.boot_rom_url,
  };
}

async function getLiveSession(
  service: SupabaseServiceLike | null,
  sessionId: string,
) {
  if (!service) return null;

  const { data, error } = await service
    .from("backend_sessions")
    .select(
      "id,user_id,game_id,mode,session_token_hash,boot_rom_url,boot_rom_filename,expires_at,deleted_at",
    )
    .eq("id", sessionId)
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<BackendSessionRow>();

  if (error || !data) return null;

  return data;
}

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: SessionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.post(
    "/sessions",
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

      const parsedBody = createSessionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid session request" });
      }

      const { data, error } = await service
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
      const existingSession = await getLiveSession(service, sessionId);
      if (existingSession) {
        return reply.status(409).send({
          error: "Session id is already active",
        });
      }

      const sessionToken = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const boot = {
        romFilename: data.rom_filename || null,
        romUrl: data.rom_url || null,
      };

      const { error: sessionError } = await service
        .from("backend_sessions")
        .insert({
          boot_rom_filename: boot.romFilename,
          boot_rom_url: boot.romUrl,
          deleted_at: null,
          expires_at: expiresAt,
          game_id: parsedBody.data.gameId,
          id: sessionId,
          mode: parsedBody.data.mode,
          session_token_hash: hashSessionToken(sessionToken),
          user_id: user.id,
        });

      if (sessionError) {
        if (sessionError.code === "23505") {
          return reply.status(409).send({
            error: "Session id is already in use",
          });
        }
        request.log.error({ err: sessionError }, "Failed to create session");
        return reply.status(500).send({ error: "Failed to create session" });
      }

      return {
        boot,
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
    { preHandler: requireUser },
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
        .safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }

      const session = await getLiveSession(service, params.data.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      if (session.user_id !== request.user?.id) {
        return reply.status(404).send({ error: "Session not found" });
      }

      return {
        expiresAt: session.expires_at,
        gameId: session.game_id,
        mode: session.mode,
        sessionId: session.id,
      };
    },
  );

  app.delete(
    "/sessions/:sessionId",
    { preHandler: requireUser },
    async (request, reply) => {
      const params = z
        .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
        .safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const session = await getLiveSession(service, params.data.sessionId);
      if (session && session.user_id === request.user?.id) {
        const { error } = await service
          .from("backend_sessions")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", params.data.sessionId)
          .eq("user_id", request.user.id);
        if (error) {
          request.log.error({ err: error }, "Failed to stop session");
          return reply.status(500).send({ error: "Failed to stop session" });
        }
      }
      return reply.status(204).send();
    },
  );

  app.post("/sessions/:sessionId/verify", async (request, reply) => {
    const params = z
      .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/) })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid session id" });
    }

    const body = z
      .object({ sessionToken: z.string().min(16) })
      .safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: "Invalid session token" });
    }

    const session = await getLiveSession(service, params.data.sessionId);
    if (
      !session ||
      !sessionTokenMatches(session.session_token_hash, body.data.sessionToken)
    ) {
      return reply.status(401).send({ error: "Invalid or expired session" });
    }

    return {
      boot: mapBoot(session),
      expiresAt: session.expires_at,
      gameId: session.game_id,
      mode: session.mode,
      sessionId: session.id,
      user: {
        id: session.user_id,
      },
    };
  });
}
