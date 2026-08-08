import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  createGetOwnedSession,
  createStopSession,
  createVerifySession,
  SessionUseCaseError,
} from "../application/sessionUseCases.js";
import { isPrivateCatalogRomUrl } from "../domain/browserArtifact.js";
import { getLiveSession, stopSession } from "../infrastructure/backendSessions.js";
import { sessionIdSchema, type SessionRouteContext } from "./sessionRouteContext.js";

const sessionParamsSchema = z.object({ sessionId: sessionIdSchema });
const verifySessionBodySchema = z.object({
  sessionToken: z.string().min(16).max(128),
});
const stopSessionBodySchema = z.object({
  sessionToken: z.string().min(16).max(128).optional(),
});

export function registerSessionLifecycleRoutes(
  app: FastifyInstance,
  context: SessionRouteContext,
) {
  const {
    attachOptionalUser,
    artifactUrlLimiter,
    requireSessionUser,
    service,
    signCatalogRom,
    verificationIpLimiter,
    verificationSessionLimiter,
  } = context;
  const findSession = service ? (id: string) => getLiveSession(service, id) : null;
  const getOwnedSession = findSession
    ? createGetOwnedSession({ findLiveSession: findSession })
    : null;
  const stopSessionUseCase = findSession
    ? createStopSession({
        findLiveSession: findSession,
        stopSession: (id) => stopSession(service!, id),
      })
    : null;
  const verifySession = findSession
    ? createVerifySession({
        authorizeArtifactSign: (identity) => artifactUrlLimiter.consume(identity),
        findLiveSession: findSession,
        isPrivateCatalogRomUrl,
        now: () => Date.now(),
        signCatalogRom,
      })
    : null;

  app.get(
    "/sessions/:sessionId",
    { preHandler: requireSessionUser },
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid session id" });
      if (!getOwnedSession) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }
      const session = await getOwnedSession(params.data.sessionId, request.user?.id);
      if (!session) return reply.status(404).send({ error: "Session not found" });
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
    { preHandler: attachOptionalUser },
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid session id" });
      if (!stopSessionUseCase) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }
      const body = stopSessionBodySchema.safeParse(request.body || {});
      if (!body.success) return reply.status(400).send({ error: "Invalid session token" });

      try {
        await stopSessionUseCase({
          sessionId: params.data.sessionId,
          sessionToken: body.data.sessionToken,
          userId: request.user?.id,
        });
        return reply.status(204).send();
      } catch (error) {
        request.log.error({ err: error }, "Failed to stop session");
        return reply.status(500).send({ error: "Failed to stop session" });
      }
    },
  );

  app.post("/sessions/:sessionId/verify", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid session id" });
    const body = verifySessionBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid session token" });
    if (!verifySession) {
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
      return reply.status(429).send({ error: "Too many session verification attempts" });
    }

    try {
      const result = await verifySession({
        artifactUrlTtlSeconds: env.BROWSER_ARTIFACT_URL_TTL_SECONDS,
        sessionId: params.data.sessionId,
        sessionToken: body.data.sessionToken,
      });
      if (result.status === "invalid") {
        return reply.status(401).send({ error: "Invalid or expired session" });
      }
      if (result.status === "artifact_rate_limited") {
        rejectRateLimitedRequest(
          reply,
          result.rateLimit,
          "Catalog ROM URL limit reached. Please try again shortly.",
        );
        return;
      }
      const { session } = result;
      return {
        boot: result.boot,
        expiresAt: session.expires_at,
        gameId: session.game_id,
        mode: session.mode,
        sessionId: session.id,
        user: { id: session.user_id },
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to sign catalog ROM URL");
      if (error instanceof SessionUseCaseError && error.stage === "sign_artifact") {
        return reply.status(503).send({
          error: "The catalog ROM is temporarily unavailable.",
        });
      }
      return reply.status(500).send({ error: "Failed to verify session" });
    }
  });
}
