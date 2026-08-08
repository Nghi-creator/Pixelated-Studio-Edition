import process from "node:process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../../auth/http/supabaseAuth.js";
import { env } from "../../../../config/env.js";
import { createRateLimiter, type RateLimiter } from "../../../security/sharedRateLimiter.js";
import { CATALOG_GENRES } from "../../domain/catalogGenres.js";
import { createCandidateReviewUseCases } from "../application/reviewCandidates.js";
import { captureGameplayArtworkWithCommand } from "../infrastructure/catalogArtworkCapture.js";
import { CandidateValidationError } from "../domain/catalogCandidateValidation.js";
import {
  promoteCandidate,
  type CaptureGameplayArtwork,
  type SupabaseServiceLike,
} from "../infrastructure/supabaseCandidatePromotion.js";
import { requireCatalogAdminRole } from "./catalogCandidateAuthorization.js";
import { registerBrowserSmokeRoutes } from "./browserSmokeRoutes.js";
import {
  claimCandidateReview,
  findCandidate,
  findCandidates,
  rejectCandidate,
  releaseCandidateReview,
} from "../infrastructure/supabaseCandidateRepository.js";

const candidateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  platformId: z
    .enum([
      "nes",
      "gb",
      "gbc",
      "gba",
      "snes",
      "genesis",
      "sms",
      "game_gear",
      "linux",
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  sourceKind: z
    .enum([
      "homebrew_hub_gb",
      "homebrew_hub_gba",
      "homebrew_hub_nes",
      "debian_main_games",
      "curated_licensed_rom",
      "user_submission",
    ])
    .optional(),
  status: z
    .enum(["needs_review", "approved", "rejected", "promoted"])
    .default("needs_review"),
});
const candidateParamsSchema = z.object({ candidateId: z.string().uuid() });
const candidateReviewBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("promote"),
    genreSlug: z.enum(CATALOG_GENRES).default("other"),
    notes: z.string().trim().max(2000).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    notes: z.string().trim().min(1).max(2000),
  }),
]);

type CatalogCandidateRouteOptions = {
  browserSmokeLimiter?: RateLimiter;
  captureGameplayArtwork?: CaptureGameplayArtwork;
  fetchArtifact?: typeof fetch;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
  smokeTicketSecret?: string;
  smokeTicketTtlSeconds?: number;
};

export async function registerCatalogCandidateRoutes(
  app: FastifyInstance,
  options: CatalogCandidateRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const fetchArtifact = options.fetchArtifact || fetch;
  const smokeTicketSecret =
    options.smokeTicketSecret === undefined
      ? env.BROWSER_SMOKE_TICKET_SECRET
      : options.smokeTicketSecret;
  const smokeTicketTtlSeconds =
    options.smokeTicketTtlSeconds || env.BROWSER_SMOKE_TICKET_TTL_SECONDS;
  const browserSmokeLimiter = options.browserSmokeLimiter || createRateLimiter({
    limit: env.BROWSER_SMOKE_RATE_LIMIT_PER_MINUTE,
    namespace: "browser-smoke-ip",
    windowMs: 60_000,
  });
  const captureGameplayArtwork =
    options.captureGameplayArtwork ||
    (process.env.CATALOG_ARTWORK_CAPTURE_COMMAND
      ? ({ artifactBytes, build, candidate, game }) =>
          captureGameplayArtworkWithCommand(
            String(process.env.CATALOG_ARTWORK_CAPTURE_COMMAND),
            {
              artifactBytes,
              artifactFilename: candidate.artifact_filename,
              buildId: build.id,
              gameId: game.id,
              platformId: candidate.platform_id,
              runtimeId: candidate.runtime_id,
              title: candidate.title,
            },
          )
      : undefined);
  const candidateReviews = service ? createCandidateReviewUseCases({
    authorize: async (userId) => (await requireCatalogAdminRole(service, userId)).ok,
    claim: (candidateId, reviewerId, now) => claimCandidateReview(service, candidateId, reviewerId, now),
    find: (candidateId) => findCandidate(service, candidateId),
    findPage: (query) => findCandidates(service, query as Parameters<typeof findCandidates>[1]),
    now: () => new Date().toISOString(),
    onReleaseError: (error) => app.log.error({ err: error }, "Failed to release catalog candidate review claim"),
    promote: (candidate, reviewerId, notes, genre) =>
      promoteCandidate(service, candidate, reviewerId, notes, genre, fetchArtifact, captureGameplayArtwork),
    reject: (candidateId, reviewerId, notes, now) => rejectCandidate(service, candidateId, reviewerId, notes, now),
    release: (candidateId, reviewerId, now) => releaseCandidateReview(service, candidateId, reviewerId, now),
  }) : null;

  app.get(
    "/admin/catalog-candidates",
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

      const parsedQuery = candidateQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid candidate query" });
      }

      try {
        const result = await candidateReviews!.list({ ...parsedQuery.data, userId: user.id });
        if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
        return { candidates: result.candidates, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load catalog candidates");
        return reply.status(500).send({ error: "Failed to load candidates" });
      }
    },
  );

  registerBrowserSmokeRoutes(app, {
    fetchArtifact,
    limiter: browserSmokeLimiter,
    requireUser,
    service,
    ticketSecret: smokeTicketSecret,
    ticketTtlSeconds: smokeTicketTtlSeconds,
  });

  app.patch(
    "/admin/catalog-candidates/:candidateId",
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

      const params = candidateParamsSchema.safeParse(request.params);
      const body = candidateReviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid candidate review" });
      }

      try {
        const result = await candidateReviews!.review({
          action: body.data.action,
          candidateId: params.data.candidateId,
          genre: body.data.action === "promote" ? body.data.genreSlug : undefined,
          notes: body.data.notes || null,
          userId: user.id,
        });
        if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
        if (result.status === "not_found") return reply.status(404).send({ error: "Candidate not found" });
        if (result.status === "already_reviewed") return reply.status(409).send({ error: "Candidate already reviewed" });
        if (result.status === "rejected") return { candidate: result.candidate };
        return result.result;
      } catch (err) {
        request.log.error({ err }, "Failed to review catalog candidate");
        if (err instanceof CandidateValidationError) {
          return reply.status(422).send({ error: err.message });
        }
        return reply.status(500).send({ error: "Failed to review candidate" });
      }
    },
  );
}
