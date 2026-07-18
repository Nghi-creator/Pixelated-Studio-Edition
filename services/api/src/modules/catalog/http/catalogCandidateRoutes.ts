import process from "node:process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CATALOG_GENRES } from "../domain/catalogGenres.js";
import { getCachedUserRole } from "../../auth/roleCache.js";
import { CandidateValidationError } from "../ingestion/catalogCandidateValidation.js";
import {
  captureGameplayArtworkWithCommand,
} from "../ingestion/catalogArtworkCapture.js";
import {
  CANDIDATE_COLUMNS,
  promoteCandidate,
  type CandidateRow,
  type CaptureGameplayArtwork,
  type SupabaseServiceLike,
} from "../ingestion/catalogCandidatePromotion.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { logTiming, timed } from "../../observability/timing.js";
import {
  enrichCandidateCompatibility,
  getCandidateBrowserCompatibility,
} from "../domain/candidateCompatibility.js";
import { fetchVerifiedCandidateArtifact } from "../ingestion/catalogCandidateStorage.js";
import { env } from "../../../config/env.js";
import {
  createBrowserSmokeTicket,
  verifyBrowserSmokeTicket,
} from "../domain/browserSmokeTicket.js";

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
const browserSmokeBodySchema = z.discriminatedUnion("status", [
  z.object({
    coreId: z.literal("fceumm"),
    status: z.literal("passed"),
  }),
  z.object({
    coreId: z.literal("fceumm"),
    error: z.string().trim().min(1).max(1000),
    status: z.literal("failed"),
  }),
]);

type CatalogCandidateRouteOptions = {
  captureGameplayArtwork?: CaptureGameplayArtwork;
  fetchArtifact?: typeof fetch;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
  smokeTicketSecret?: string;
  smokeTicketTtlSeconds?: number;
};

function readSmokeTicket(authorization: string | undefined) {
  const match = authorization?.match(/^Smoke\s+(.+)$/i);
  return match?.[1] || "";
}

function smokeTicketWasUsed(candidate: CandidateRow, issuedAt: number) {
  if (!candidate.browser_smoke_tested_at) return false;
  return new Date(candidate.browser_smoke_tested_at).getTime() >= issuedAt;
}

async function requireAdminRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const roleLookup = await getCachedUserRole(service, userId);
  if (roleLookup.error) throw roleLookup.error;
  return {
    cache: roleLookup.cache,
    ok: ["admin", "super_admin"].includes(roleLookup.role || ""),
  };
}

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

      const timings = {};
      let roleLookup: Awaited<ReturnType<typeof requireAdminRole>>;
      try {
        roleLookup = await timed(timings, "admin_role_check_ms", () =>
          requireAdminRole(service, user.id),
        );
      } catch (err) {
        request.log.error(
          { err },
          "Failed to authorize catalog candidates",
        );
        return reply.status(500).send({ error: "Failed to authorize candidates" });
      }
      if (!roleLookup.ok) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parsedQuery = candidateQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid candidate query" });
      }

      const { page, pageSize, platformId, search, sourceKind, status } =
        parsedQuery.data;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let query = service
        .from("catalog_ingestion_candidates")
        .select(CANDIDATE_COLUMNS, { count: "exact" })
        .eq("import_status", status)
        .order("last_seen_at", { ascending: false })
        .range(start, end);

      if (platformId) query = query.eq("platform_id", platformId);
      if (sourceKind) query = query.eq("source_kind", sourceKind);
      if (search) query = query.ilike("title", `%${search}%`);

      const { count, data, error } = await timed(
        timings,
        "catalog_candidates_query_ms",
        () => query,
      );
      if (error) {
        request.log.error({ err: error }, "Failed to load catalog candidates");
        return reply.status(500).send({ error: "Failed to load candidates" });
      }

      const total = count || 0;
      logTiming(request.log, "Catalog candidates timing", timings, {
        page,
        pageSize,
        platformId,
        resultCount: data?.length || 0,
        roleCache: roleLookup.cache,
        search: Boolean(search),
        sourceKind,
        status,
        total,
      });

      return {
        candidates: ((data || []) as unknown as CandidateRow[]).map((candidate) =>
          enrichCandidateCompatibility(candidate),
        ),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  app.post(
    "/admin/catalog-candidates/:candidateId/browser-smoke-ticket",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }
      const params = candidateParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid candidate" });
      if (!smokeTicketSecret) {
        return reply.status(503).send({
          error: "Browser smoke tickets are not configured for the API.",
        });
      }

      try {
        const role = await requireAdminRole(service, user.id);
        if (!role.ok) return reply.status(403).send({ error: "Admin access required" });
        const { data: candidate, error } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", params.data.candidateId)
          .maybeSingle<CandidateRow>();
        if (error) throw error;
        if (!candidate) return reply.status(404).send({ error: "Candidate not found" });
        const compatibility = getCandidateBrowserCompatibility(candidate);
        if (!compatibility.eligible) {
          return reply.status(422).send({
            error: compatibility.reason || "Candidate is not browser-compatible.",
          });
        }
        const artifactSha256 = candidate.artifact_sha256?.toLowerCase();
        if (!artifactSha256 || compatibility.coreId !== "fceumm") {
          return reply.status(422).send({ error: "Candidate evidence is incomplete." });
        }
        const issued = createBrowserSmokeTicket(
          {
            artifactSha256,
            candidateId: candidate.id,
            coreId: compatibility.coreId,
            reviewerId: user.id,
          },
          smokeTicketSecret,
          smokeTicketTtlSeconds,
        );
        return reply.header("Cache-Control", "no-store").send(issued);
      } catch (err) {
        request.log.error({ err }, "Failed to create browser smoke ticket");
        return reply.status(500).send({ error: "Failed to create browser smoke ticket" });
      }
    },
  );

  app.get(
    "/browser-smoke/session",
    async (request, reply) => {
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }
      if (!smokeTicketSecret) {
        return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
      }

      try {
        const ticket = verifyBrowserSmokeTicket(
          readSmokeTicket(request.headers.authorization),
          smokeTicketSecret,
        );
        const { data: candidate, error: candidateError } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", ticket.candidateId)
          .maybeSingle<CandidateRow>();
        if (candidateError) throw candidateError;
        if (!candidate) return reply.status(404).send({ error: "Candidate not found" });
        if (smokeTicketWasUsed(candidate, ticket.issuedAt)) {
          return reply.status(409).send({ error: "This smoke ticket has already been used." });
        }

        const compatibility = getCandidateBrowserCompatibility(candidate);
        if (
          !compatibility.eligible ||
          compatibility.coreId !== ticket.coreId ||
          candidate.artifact_sha256?.toLowerCase() !== ticket.artifactSha256
        ) {
          return reply.status(422).send({
            error: "Candidate evidence changed after this smoke ticket was issued.",
          });
        }
        return reply.header("Cache-Control", "no-store").send({
          artifactFilename: candidate.artifact_filename,
          artifactSha256: candidate.artifact_sha256,
          artifactSize: candidate.artifact_size,
          candidateId: candidate.id,
          coreId: ticket.coreId,
          expiresAt: new Date(ticket.expiresAt).toISOString(),
          systemId: compatibility.systemId,
          title: candidate.title,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid smoke ticket";
        return reply.status(401).send({ error: message });
      }
    },
  );

  app.get(
    "/browser-smoke/artifact",
    async (request, reply) => {
      if (!service || !smokeTicketSecret) {
        return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
      }
      try {
        const ticket = verifyBrowserSmokeTicket(
          readSmokeTicket(request.headers.authorization),
          smokeTicketSecret,
        );
        const { data: candidate, error } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", ticket.candidateId)
          .maybeSingle<CandidateRow>();
        if (error) throw error;
        if (!candidate) return reply.status(404).send({ error: "Candidate not found" });
        if (smokeTicketWasUsed(candidate, ticket.issuedAt)) {
          return reply.status(409).send({ error: "This smoke ticket has already been used." });
        }
        const compatibility = getCandidateBrowserCompatibility(candidate);
        if (
          !compatibility.eligible ||
          compatibility.coreId !== ticket.coreId ||
          candidate.artifact_sha256?.toLowerCase() !== ticket.artifactSha256
        ) {
          return reply.status(422).send({ error: "Candidate evidence changed." });
        }
        const bytes = await fetchVerifiedCandidateArtifact(candidate, fetchArtifact);
        return reply
          .header("Cache-Control", "no-store")
          .header("Content-Length", String(bytes.length))
          .type("application/octet-stream")
          .send(bytes);
      } catch (err) {
        if (err instanceof CandidateValidationError) {
          return reply.status(422).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "Invalid smoke ticket";
        return reply.status(401).send({ error: message });
      }
    },
  );

  app.post(
    "/browser-smoke/result",
    async (request, reply) => {
      if (!service || !smokeTicketSecret) {
        return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
      }
      const body = browserSmokeBodySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "Invalid browser smoke result" });

      try {
        const ticket = verifyBrowserSmokeTicket(
          readSmokeTicket(request.headers.authorization),
          smokeTicketSecret,
        );
        const { data: candidate, error: candidateError } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", ticket.candidateId)
          .maybeSingle<CandidateRow>();
        if (candidateError) throw candidateError;
        if (!candidate) return reply.status(404).send({ error: "Candidate not found" });
        if (smokeTicketWasUsed(candidate, ticket.issuedAt)) {
          return reply.status(409).send({ error: "This smoke ticket has already been used." });
        }
        const compatibility = getCandidateBrowserCompatibility(candidate);
        if (
          !compatibility.eligible ||
          compatibility.coreId !== body.data.coreId ||
          compatibility.coreId !== ticket.coreId ||
          candidate.artifact_sha256?.toLowerCase() !== ticket.artifactSha256
        ) {
          return reply.status(422).send({ error: "Candidate evidence changed." });
        }
        if (body.data.status === "passed") await fetchVerifiedCandidateArtifact(candidate, fetchArtifact);

        const now = new Date().toISOString();
        const { data, error } = await service
          .from("catalog_ingestion_candidates")
          .update({
            browser_smoke_core_id: body.data.coreId,
            browser_smoke_error:
              body.data.status === "failed" ? body.data.error : null,
            browser_smoke_status: body.data.status,
            browser_smoke_tested_at: now,
            browser_smoke_tested_by: ticket.reviewerId,
            updated_at: now,
          })
          .eq("id", candidate.id)
          .select(CANDIDATE_COLUMNS)
          .single<CandidateRow>();
        if (error) throw error;
        return { candidate: enrichCandidateCompatibility(data) };
      } catch (err) {
        request.log.error({ err }, "Failed to record browser smoke result");
        if (err instanceof CandidateValidationError) {
          return reply.status(422).send({ error: err.message });
        }
        if (err instanceof Error && /ticket/i.test(err.message)) {
          return reply.status(401).send({ error: err.message });
        }
        return reply.status(500).send({ error: "Failed to record browser smoke result" });
      }
    },
  );

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
        const role = await requireAdminRole(service, user.id);
        if (!role.ok) {
          return reply.status(403).send({ error: "Admin access required" });
        }

        const { data: candidate, error: candidateError } = await service
          .from("catalog_ingestion_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("id", params.data.candidateId)
          .maybeSingle<CandidateRow>();
        if (candidateError) throw candidateError;
        if (!candidate) {
          return reply.status(404).send({ error: "Candidate not found" });
        }
        if (candidate.import_status === "promoted") {
          return reply.status(409).send({ error: "Candidate already promoted" });
        }

        const now = new Date().toISOString();
        if (body.data.action === "reject") {
          const { data, error } = await service
            .from("catalog_ingestion_candidates")
            .update({
              import_status: "rejected",
              review_notes: body.data.notes,
              reviewed_at: now,
              reviewed_by: user.id,
              updated_at: now,
            })
            .eq("id", candidate.id)
            .select(CANDIDATE_COLUMNS)
            .single<CandidateRow>();
          if (error) throw error;
          return { candidate: data };
        }

        const promoted = await promoteCandidate(
          service,
          candidate,
          user.id,
          body.data.notes || null,
          body.data.genreSlug,
          fetchArtifact,
          captureGameplayArtwork,
        );
        return promoted;
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
