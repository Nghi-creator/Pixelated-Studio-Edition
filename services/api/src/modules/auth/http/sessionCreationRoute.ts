import type { FastifyInstance } from "fastify";
import { env } from "../../../config/env.js";
import { fetchPublishedGameById } from "../../catalog/infrastructure/supabaseCatalogRepository.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  createCreateSession,
  SessionUseCaseError,
} from "../application/sessionUseCases.js";
import { getLiveSession, insertSession } from "../infrastructure/backendSessions.js";
import { isAnonymousSupabaseUser } from "./supabaseAuth.js";
import {
  createSessionBodySchema,
  SESSION_TTL_MS,
  type SessionRouteContext,
} from "./sessionRouteContext.js";

export function registerSessionCreationRoute(
  app: FastifyInstance,
  context: SessionRouteContext,
) {
  const {
    attachOptionalUser,
    anonymousSessionCreateIpLimiter,
    artifactUrlLimiter,
    service,
    sessionCreateLimiter,
    signCatalogRom,
  } = context;
  const createSession = service
    ? createCreateSession({
        authorizeArtifactSign: (identity) => artifactUrlLimiter.consume(identity),
        findGame: (gameId) => fetchPublishedGameById(service, gameId),
        findLiveSession: (sessionId) => getLiveSession(service, sessionId),
        insertSession: (row) => insertSession(service, row),
        now: () => Date.now(),
        signCatalogRom,
      })
    : null;

  app.post(
    "/sessions",
    { preHandler: attachOptionalUser },
    async (request, reply) => {
      const user = request.user;
      if (!createSession) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const body = createSessionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid session request" });
      }

      const requestsBrowserArtifact =
        body.data.clientEdition === "user" &&
        body.data.runtimeKind === "wasm" &&
        body.data.mode === "cloud";
      const isAnonymousUser = isAnonymousSupabaseUser(user);
      if (!user && !requestsBrowserArtifact) {
        return reply.status(401).send({
          error: "Authentication is required for Studio, WebRTC, and native sessions.",
        });
      }

      const rateLimitIdentity = user
        ? `${isAnonymousUser ? "guest-user" : "user"}:${user.id}`
        : `guest-ip:${request.ip}`;
      const usesAnonymousAccess = !user || isAnonymousUser;
      const sessionRateLimits = await Promise.all([
        sessionCreateLimiter.consume(rateLimitIdentity),
        ...(usesAnonymousAccess
          ? [anonymousSessionCreateIpLimiter.consume(request.ip)]
          : []),
      ]);
      const blockedRateLimit = sessionRateLimits.find((result) => !result.allowed);
      if (
        blockedRateLimit &&
        rejectRateLimitedRequest(
          reply,
          blockedRateLimit,
          usesAnonymousAccess
            ? "Guest session creation rate limit reached. Please try again shortly."
            : "Session creation rate limit reached. Please try again shortly.",
        )
      ) return;

      try {
        const result = await createSession({
          artifactUrlTtlSeconds: env.BROWSER_ARTIFACT_URL_TTL_SECONDS,
          clientEdition: body.data.clientEdition,
          clientRuntimeKind: body.data.runtimeKind,
          clientSessionId: body.data.clientSessionId,
          gameId: body.data.gameId,
          isAnonymousUser,
          mode: body.data.mode,
          rateLimitIdentity,
          sessionTtlMs: SESSION_TTL_MS,
          userId: user?.id || null,
        });

        if (result.status === "game_not_found") {
          return reply.status(404).send({ error: "Game not found" });
        }
        if (result.status === "build_not_found") {
          return reply.status(422).send({ error: "Game has no approved build" });
        }
        if (result.status === "unbootable" || result.status === "browser_ineligible") {
          request.log.warn({ gameId: body.data.gameId }, "Rejected unbootable game build");
          return reply.status(422).send({ error: result.error });
        }
        if (result.status === "active_conflict") {
          return reply.status(409).send({ error: "Session id is already active" });
        }
        if (result.status === "id_conflict") {
          return reply.status(409).send({ error: "Session id is already in use" });
        }
        if (result.status === "artifact_rate_limited") {
          rejectRateLimitedRequest(
            reply,
            result.rateLimit,
            "Catalog ROM URL limit reached. Please try again shortly.",
          );
          return;
        }

        return {
          boot: result.boot,
          engineUrl: "http://localhost:8080",
          expiresAt: result.expiresAt,
          sessionId: result.sessionId,
          sessionToken: result.sessionToken,
          user: { id: user?.id || null, isAnonymous: isAnonymousUser },
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to create session");
        if (error instanceof SessionUseCaseError && error.stage === "sign_artifact") {
          return reply.status(503).send({
            error: "The catalog ROM is temporarily unavailable.",
          });
        }
        return reply.status(500).send({ error: "Failed to create session" });
      }
    },
  );
}
