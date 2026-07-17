import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../supabaseAuth.js";
import { assertBuildBootable, mapBoot } from "../domain/sessionBoot.js";
import {
  createSignedCatalogRomUrl,
  getBrowserEligibility,
  isPrivateCatalogRomUrl,
} from "../domain/browserArtifact.js";
import {
  createSessionId,
  createSessionToken,
  hashSessionToken,
  sessionTokenMatches,
} from "../domain/sessionTokens.js";
import {
  getLiveSession,
  type SupabaseServiceLike,
} from "../services/backendSessions.js";
import { fetchPublishedGameById } from "../../catalog/services/catalogService.js";
import { CandidateValidationError } from "../../catalog/ingestion/catalogCandidateValidation.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import type { RateLimiter } from "../../security/sharedRateLimiter.js";
import { env } from "../../../config/env.js";

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80);

const createSessionBodySchema = z.object({
  clientEdition: z.enum(["studio", "user"]).default("studio"),
  clientSessionId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(80)
    .optional(),
  gameId: z.string().uuid(),
  mode: z.enum(["cloud", "local"]).default("cloud"),
  runtimeKind: z.enum(["wasm", "webrtc", "native"]).default("webrtc"),
});

type SessionRouteOptions = {
  artifactUrlLimiter?: RateLimiter;
  signCatalogRom?: (artifactUrl: string, expiresInSeconds: number) => Promise<string>;
  requireUser?: typeof requireSupabaseUser;
  sessionCreateLimiter?: RateLimiter;
  supabase?: SupabaseServiceLike | null;
};

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: SessionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const sessionCreateLimiter =
    options.sessionCreateLimiter ||
    createRateLimiter({
      limit: 60,
      namespace: "session-create-user",
      windowMs: 60_000,
    });
  const artifactUrlLimiter = options.artifactUrlLimiter || createRateLimiter({
    limit: env.BROWSER_ARTIFACT_RATE_LIMIT_PER_MINUTE,
    namespace: "browser-artifact-user",
    windowMs: 60_000,
  });
  const signCatalogRom = options.signCatalogRom || (async (artifactUrl, expiresInSeconds) => {
    if (!service || !env.SUPABASE_URL) throw new Error("Supabase artifact signing is not configured.");
    return createSignedCatalogRomUrl({ artifactUrl, expiresInSeconds, service, supabaseUrl: env.SUPABASE_URL });
  });
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
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Authentication is required to create a session." });
      if (
        rejectRateLimitedRequest(
          reply,
          await sessionCreateLimiter.consume(user.id),
          "Session creation rate limit reached. Please try again shortly.",
        )
      ) {
        return;
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
      try {
        assertBuildBootable(build);
      } catch (err) {
        if (err instanceof CandidateValidationError) {
          request.log.warn(
            { err, gameId: parsedBody.data.gameId },
            "Rejected unbootable game build",
          );
          return reply.status(422).send({ error: err.message });
        }
        throw err;
      }
      const launchManifestId = build.launch_manifest_id || null;
      const browser = getBrowserEligibility(build);
      const requestsBrowserArtifact =
        parsedBody.data.clientEdition === "user" && parsedBody.data.runtimeKind === "wasm";
      if (requestsBrowserArtifact && !browser.eligible) {
        return reply.status(422).send({ error: browser.reason || "This build is not browser compatible." });
      }

      const sessionId = createSessionId(parsedBody.data.clientSessionId);
      const existingSession = await getLiveSession(service, sessionId);
      if (existingSession) {
        return reply.status(409).send({
          error: "Session id is already active",
        });
      }

      let signedArtifactUrl: string | null = null;
      let artifactUrlExpiresAt: string | null = null;
      if (requestsBrowserArtifact) {
        if (
          rejectRateLimitedRequest(
            reply,
            await artifactUrlLimiter.consume(user.id),
            "Catalog ROM URL limit reached. Please try again shortly.",
          )
        ) {
          return;
        }
        try {
          signedArtifactUrl = await signCatalogRom(
            build.artifact_url || "",
            env.BROWSER_ARTIFACT_URL_TTL_SECONDS,
          );
          artifactUrlExpiresAt = new Date(
            Date.now() + env.BROWSER_ARTIFACT_URL_TTL_SECONDS * 1000,
          ).toISOString();
        } catch (err) {
          request.log.error({ err, gameId: parsedBody.data.gameId }, "Failed to sign browser catalog ROM URL");
          return reply.status(503).send({ error: "The catalog ROM is temporarily unavailable." });
        }
      }

      const sessionToken = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const storedBoot = {
        artifactSha256: build.artifact_sha256 || null,
        artifactSize: build.artifact_size || null,
        launchManifestId,
        romFilename: build.artifact_filename || null,
        romUrl: build.artifact_url || null,
        runtimeId: build.runtime_id,
        runtimeKind: build.runtime_kind,
      };
      const boot = {
        ...storedBoot,
        browser: { ...browser, artifactUrlExpiresAt },
        romUrl: signedArtifactUrl || storedBoot.romUrl,
      };

      const { error: sessionError } = await service
        .from("backend_sessions")
        .insert({
          boot_artifact_sha256: storedBoot.artifactSha256,
          boot_artifact_size: storedBoot.artifactSize,
          boot_launch_manifest_id: storedBoot.launchManifestId,
          boot_rom_filename: storedBoot.romFilename,
          boot_rom_url: storedBoot.romUrl,
          boot_runtime_id: storedBoot.runtimeId,
          browser_core_id: browser.coreId,
          browser_system_id: browser.systemId,
          client_edition: parsedBody.data.clientEdition,
          client_runtime_kind: parsedBody.data.runtimeKind,
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
        .object({ sessionId: sessionIdSchema })
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
        .object({ sessionId: sessionIdSchema })
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
      .object({ sessionId: sessionIdSchema })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid session id" });
    }

    const body = z
      .object({ sessionToken: z.string().min(16).max(128) })
      .safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: "Invalid session token" });
    }

    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
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

    let verifiedRomUrl = session.boot_rom_url;
    let artifactUrlExpiresAt: string | null = null;
    if (verifiedRomUrl && isPrivateCatalogRomUrl(verifiedRomUrl)) {
      if (
        rejectRateLimitedRequest(
          reply,
          await artifactUrlLimiter.consume(session.user_id || session.id),
          "Catalog ROM URL limit reached. Please try again shortly.",
        )
      ) {
        return;
      }
      try {
        verifiedRomUrl = await signCatalogRom(
          verifiedRomUrl,
          env.BROWSER_ARTIFACT_URL_TTL_SECONDS,
        );
        artifactUrlExpiresAt = new Date(
          Date.now() + env.BROWSER_ARTIFACT_URL_TTL_SECONDS * 1000,
        ).toISOString();
      } catch (err) {
        request.log.error({ err, sessionId: session.id }, "Failed to sign catalog ROM URL");
        return reply.status(503).send({ error: "The catalog ROM is temporarily unavailable." });
      }
    }

    return {
      boot: mapBoot(session, { artifactUrlExpiresAt, romUrl: verifiedRomUrl }),
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
