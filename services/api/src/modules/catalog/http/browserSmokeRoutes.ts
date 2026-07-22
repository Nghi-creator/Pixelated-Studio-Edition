import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BROWSER_CORE_IDS } from "../../auth/domain/browserCoreContract.js";
import type { requireSupabaseUser } from "../../auth/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import type { RateLimiter } from "../../security/sharedRateLimiter.js";
import {
  getCandidateBrowserCompatibility,
  enrichCandidateCompatibility,
} from "../domain/candidateCompatibility.js";
import {
  createBrowserSmokeTicket,
  readBrowserSmokeTicketAuthorization,
  verifyBrowserSmokeTicket,
} from "../domain/browserSmokeTicket.js";
import { CandidateValidationError } from "../ingestion/catalogCandidateValidation.js";
import {
  CANDIDATE_COLUMNS,
  type CandidateRow,
  type SupabaseServiceLike,
} from "../ingestion/catalogCandidatePromotion.js";
import { fetchVerifiedCandidateArtifact } from "../ingestion/catalogCandidateStorage.js";
import { requireCatalogAdminRole } from "./catalogCandidateAuthorization.js";

const candidateParamsSchema = z.object({ candidateId: z.string().uuid() });
const browserSmokeBodySchema = z.discriminatedUnion("status", [
  z.object({
    coreId: z.enum(BROWSER_CORE_IDS),
    status: z.literal("passed"),
  }),
  z.object({
    coreId: z.enum(BROWSER_CORE_IDS),
    error: z.string().trim().min(1).max(1000),
    status: z.literal("failed"),
  }),
]);

type BrowserSmokeRouteOptions = {
  fetchArtifact: typeof fetch;
  limiter: RateLimiter;
  requireUser: typeof requireSupabaseUser;
  service: SupabaseServiceLike | null;
  ticketSecret: string | undefined;
  ticketTtlSeconds: number;
};

function smokeTicketWasUsed(candidate: CandidateRow, issuedAt: number) {
  if (!candidate.browser_smoke_tested_at) return false;
  return new Date(candidate.browser_smoke_tested_at).getTime() >= issuedAt;
}

export function registerBrowserSmokeRoutes(
  app: FastifyInstance,
  options: BrowserSmokeRouteOptions,
) {
  const {
    fetchArtifact,
    limiter,
    requireUser,
    service,
    ticketSecret,
    ticketTtlSeconds,
  } = options;

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
      if (!ticketSecret) {
        return reply.status(503).send({
          error: "Browser smoke tickets are not configured for the API.",
        });
      }

      try {
        const role = await requireCatalogAdminRole(service, user.id);
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
        if (!artifactSha256 || !compatibility.coreId) {
          return reply.status(422).send({ error: "Candidate evidence is incomplete." });
        }
        const issued = createBrowserSmokeTicket(
          {
            artifactSha256,
            candidateId: candidate.id,
            coreId: compatibility.coreId,
            reviewerId: user.id,
          },
          ticketSecret,
          ticketTtlSeconds,
        );
        return reply.header("Cache-Control", "no-store").send(issued);
      } catch (err) {
        request.log.error({ err }, "Failed to create browser smoke ticket");
        return reply.status(500).send({ error: "Failed to create browser smoke ticket" });
      }
    },
  );

  app.get("/browser-smoke/session", async (request, reply) => {
    if (
      rejectRateLimitedRequest(
        reply,
        await limiter.consume(request.ip),
        "Browser smoke rate limit reached. Please try again shortly.",
      )
    ) {
      return;
    }
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }
    if (!ticketSecret) {
      return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    }

    try {
      const ticket = verifyBrowserSmokeTicket(
        readBrowserSmokeTicketAuthorization(request.headers.authorization),
        ticketSecret,
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
  });

  app.get("/browser-smoke/artifact", async (request, reply) => {
    if (
      rejectRateLimitedRequest(
        reply,
        await limiter.consume(request.ip),
        "Browser smoke rate limit reached. Please try again shortly.",
      )
    ) {
      return;
    }
    if (!service || !ticketSecret) {
      return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    }
    try {
      const ticket = verifyBrowserSmokeTicket(
        readBrowserSmokeTicketAuthorization(request.headers.authorization),
        ticketSecret,
      );
      const { data: claimed, error: claimError } = await service.rpc(
        "claim_browser_smoke_artifact",
        {
          p_candidate_id: ticket.candidateId,
          p_expires_at: new Date(ticket.expiresAt).toISOString(),
          p_nonce: ticket.nonce,
        },
      );
      if (claimError) {
        request.log.error({ err: claimError }, "Failed to claim browser smoke artifact");
        return reply.status(500).send({ error: "Failed to authorize smoke artifact" });
      }
      if (claimed !== true) {
        return reply.status(409).send({
          error: "This smoke ticket has already fetched its artifact.",
        });
      }
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
      const bytes = await fetchVerifiedCandidateArtifact(candidate, fetchArtifact, service);
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
  });

  app.post("/browser-smoke/result", async (request, reply) => {
    if (
      rejectRateLimitedRequest(
        reply,
        await limiter.consume(request.ip),
        "Browser smoke rate limit reached. Please try again shortly.",
      )
    ) {
      return;
    }
    if (!service || !ticketSecret) {
      return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    }
    const body = browserSmokeBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid browser smoke result" });
    }

    try {
      const ticket = verifyBrowserSmokeTicket(
        readBrowserSmokeTicketAuthorization(request.headers.authorization),
        ticketSecret,
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
      if (body.data.status === "passed") {
        await fetchVerifiedCandidateArtifact(candidate, fetchArtifact, service);
      }

      const { data: recorded, error: recordError } = await service.rpc(
        "record_browser_smoke_result",
        {
          p_artifact_sha256: ticket.artifactSha256,
          p_candidate_id: candidate.id,
          p_core_id: body.data.coreId,
          p_error: body.data.status === "failed" ? body.data.error : null,
          p_issued_at: new Date(ticket.issuedAt).toISOString(),
          p_reviewer_id: ticket.reviewerId,
          p_status: body.data.status,
        },
      );
      if (recordError) throw recordError;
      if (recorded !== true) {
        return reply.status(409).send({
          error: "This smoke ticket has already been used.",
        });
      }

      const { data: updatedCandidate, error: updatedCandidateError } = await service
        .from("catalog_ingestion_candidates")
        .select(CANDIDATE_COLUMNS)
        .eq("id", candidate.id)
        .single<CandidateRow>();
      if (updatedCandidateError) throw updatedCandidateError;
      return { candidate: enrichCandidateCompatibility(updatedCandidate) };
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
  });
}
