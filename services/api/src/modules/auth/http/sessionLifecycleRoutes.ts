import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { isPrivateCatalogRomUrl } from "../domain/browserArtifact.js";
import { mapBoot } from "../domain/sessionBoot.js";
import { sessionTokenMatches } from "../domain/sessionTokens.js";
import { getLiveSession } from "../services/backendSessions.js";
import {
  sessionIdSchema,
  type SessionRouteContext,
} from "./sessionRouteContext.js";

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

  app.get(
    "/sessions/:sessionId",
    { preHandler: requireSessionUser },
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const session = await getLiveSession(service, params.data.sessionId);
      if (!session || session.user_id !== request.user?.id) {
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
    { preHandler: attachOptionalUser },
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: "Invalid session id" });
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const body = stopSessionBodySchema.safeParse(request.body || {});
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid session token" });
      }

      const session = await getLiveSession(service, params.data.sessionId);
      const ownedByUser = Boolean(
        request.user && session?.user_id === request.user.id,
      );
      const authorizedBySessionToken = Boolean(
        session &&
          body.data.sessionToken &&
          sessionTokenMatches(
            session.session_token_hash,
            body.data.sessionToken,
          ),
      );
      if (session && (ownedByUser || authorizedBySessionToken)) {
        const { error } = await service
          .from("backend_sessions")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", params.data.sessionId);
        if (error) {
          request.log.error({ err: error }, "Failed to stop session");
          return reply.status(500).send({ error: "Failed to stop session" });
        }
      }
      return reply.status(204).send();
    },
  );

  app.post("/sessions/:sessionId/verify", async (request, reply) => {
    const params = sessionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid session id" });
    }
    const body = verifySessionBodySchema.safeParse(request.body);
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
        request.log.error(
          { err, sessionId: session.id },
          "Failed to sign catalog ROM URL",
        );
        return reply.status(503).send({
          error: "The catalog ROM is temporarily unavailable.",
        });
      }
    }

    return {
      boot: mapBoot(session, { artifactUrlExpiresAt, romUrl: verifiedRomUrl }),
      expiresAt: session.expires_at,
      gameId: session.game_id,
      mode: session.mode,
      sessionId: session.id,
      user: { id: session.user_id },
    };
  });
}
