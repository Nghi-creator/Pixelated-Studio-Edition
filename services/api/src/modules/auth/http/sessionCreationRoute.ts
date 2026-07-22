import type { FastifyInstance } from "fastify";
import { env } from "../../../config/env.js";
import { CandidateValidationError } from "../../catalog/ingestion/catalogCandidateValidation.js";
import { fetchPublishedGameById } from "../../catalog/services/catalogService.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { getBrowserEligibility } from "../domain/browserArtifact.js";
import { assertBuildBootable } from "../domain/sessionBoot.js";
import {
  createSessionId,
  createSessionToken,
  hashSessionToken,
} from "../domain/sessionTokens.js";
import { getLiveSession } from "../services/backendSessions.js";
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
    artifactUrlLimiter,
    requireUser,
    service,
    sessionCreateLimiter,
    signCatalogRom,
  } = context;

  app.post(
    "/sessions",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({
          error: "Authentication is required to create a session.",
        });
      }
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
      if (!game) return reply.status(404).send({ error: "Game not found" });

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

      const browser = getBrowserEligibility(build);
      const requestsBrowserArtifact =
        parsedBody.data.clientEdition === "user" &&
        parsedBody.data.runtimeKind === "wasm";
      if (requestsBrowserArtifact && !browser.eligible) {
        return reply.status(422).send({
          error: browser.reason || "This build is not browser compatible.",
        });
      }

      const sessionId = createSessionId(parsedBody.data.clientSessionId);
      if (await getLiveSession(service, sessionId)) {
        return reply.status(409).send({ error: "Session id is already active" });
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
          request.log.error(
            { err, gameId: parsedBody.data.gameId },
            "Failed to sign browser catalog ROM URL",
          );
          return reply.status(503).send({
            error: "The catalog ROM is temporarily unavailable.",
          });
        }
      }

      const sessionToken = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const storedBoot = {
        artifactSha256: build.artifact_sha256 || null,
        artifactSize: build.artifact_size || null,
        launchManifestId: build.launch_manifest_id || null,
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
          browser_core_id: requestsBrowserArtifact ? browser.coreId : null,
          browser_system_id: requestsBrowserArtifact ? browser.systemId : null,
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
          return reply.status(409).send({ error: "Session id is already in use" });
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
        user: { id: user.id },
      };
    },
  );
}
