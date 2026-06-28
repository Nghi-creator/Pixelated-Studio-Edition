import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  attachOptionalSupabaseUser,
  requireSupabaseUser,
  supabaseService,
} from "../supabaseAuth.js";
import { fetchPublishedGameById } from "../../catalog/services/catalogService.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";

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
  boot_artifact_sha256: string | null;
  boot_artifact_size: number | null;
  boot_launch_manifest_id: string | null;
  boot_rom_filename: string | null;
  boot_rom_url: string | null;
  boot_runtime_id: string;
  deleted_at: string | null;
  expires_at: string;
  game_id: string;
  id: string;
  mode: "cloud" | "local";
  session_token_hash: string;
  user_id: string | null;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type SessionRouteOptions = {
  optionalUser?: typeof attachOptionalSupabaseUser;
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
    artifactSha256: row.boot_artifact_sha256,
    artifactSize: row.boot_artifact_size,
    launchManifestId: row.boot_launch_manifest_id,
    romFilename: row.boot_rom_filename,
    romUrl: row.boot_rom_url,
    runtimeId: row.boot_runtime_id,
    runtimeKind:
      row.boot_launch_manifest_id && !row.boot_rom_url && !row.boot_rom_filename
        ? "native_linux"
        : "libretro",
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
      "id,user_id,game_id,mode,session_token_hash,boot_rom_url,boot_rom_filename,boot_runtime_id,boot_artifact_size,boot_artifact_sha256,boot_launch_manifest_id,expires_at,deleted_at",
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
  const optionalUser = options.optionalUser || attachOptionalSupabaseUser;
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const verificationIpLimiter = createRateLimiter({
    limit: 1_000,
    namespace: "session-verification-ip",
    windowMs: 60_000,
  });
  const verificationSessionLimiter = createRateLimiter({
    limit: 30,
    namespace: "session-verification-session",
    windowMs: 60_000,
  });

  app.post(
    "/sessions",
    { preHandler: optionalUser },
    async (request, reply) => {
      const user = request.user;

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedBody = createSessionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid session request" });
      }

      let game = null;
      try {
        game = await fetchPublishedGameById(service, parsedBody.data.gameId);
      } catch (err) {
        request.log.error({ err }, "Failed to load session game");
        return reply.status(500).send({ error: "Failed to create session" });
      }

      if (!game) {
        return reply.status(404).send({ error: "Game not found" });
      }

      const build = game.game_builds[0];
      if (!build) {
        return reply.status(422).send({ error: "Game has no approved build" });
      }
      const romTarget = build?.artifact_url || build?.artifact_filename;
      const launchManifestId = build.launch_manifest_id || null;
      if (build.runtime_kind === "libretro" && !romTarget) {
        return reply.status(422).send({ error: "Game has no ROM target" });
      }
      if (build.runtime_kind === "native_linux" && !launchManifestId) {
        return reply.status(422).send({ error: "Game has no launch manifest" });
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
        artifactSha256: build.artifact_sha256 || null,
        artifactSize: build.artifact_size || null,
        launchManifestId,
        romFilename: build.artifact_filename || null,
        romUrl: build.artifact_url || null,
        runtimeId: build.runtime_id,
        runtimeKind: build.runtime_kind,
      };

      const { error: sessionError } = await service
        .from("backend_sessions")
        .insert({
          boot_artifact_sha256: boot.artifactSha256,
          boot_artifact_size: boot.artifactSize,
          boot_launch_manifest_id: boot.launchManifestId,
          boot_rom_filename: boot.romFilename,
          boot_rom_url: boot.romUrl,
          boot_runtime_id: boot.runtimeId,
          deleted_at: null,
          expires_at: expiresAt,
          game_id: parsedBody.data.gameId,
          id: sessionId,
          mode: parsedBody.data.mode,
          session_token_hash: hashSessionToken(sessionToken),
          user_id: user?.id || null,
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
          id: user?.id || null,
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

    const rateLimits = await Promise.all([
      verificationIpLimiter.consume(request.ip),
      verificationSessionLimiter.consume(`${request.ip}:${params.data.sessionId}`),
    ]);
    const blockedRateLimit = rateLimits.find((result) => !result.allowed);
    if (blockedRateLimit) {
      reply.header(
        "Retry-After",
        Math.max(1, Math.ceil((blockedRateLimit.resetAt - Date.now()) / 1000)),
      );
      return reply.status(429).send({
        error: "Too many session verification attempts",
      });
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
