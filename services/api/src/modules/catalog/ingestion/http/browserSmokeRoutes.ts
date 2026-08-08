import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BROWSER_CORE_IDS } from "../../../auth/domain/browserCoreContract.js";
import type { requireSupabaseUser } from "../../../auth/http/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../../security/rateLimitResponse.js";
import type { RateLimiter } from "../../../security/sharedRateLimiter.js";
import { BrowserSmokeClaimError, createBrowserSmokeUseCases } from "../application/browserSmoke.js";
import { CandidateValidationError } from "../domain/catalogCandidateValidation.js";
import { fetchVerifiedCandidateArtifact } from "../infrastructure/catalogCandidateStorage.js";
import type { SupabaseServiceLike } from "../infrastructure/supabaseCandidatePromotion.js";
import { claimBrowserSmokeArtifact, findCandidate, recordBrowserSmokeResult } from "../infrastructure/supabaseCandidateRepository.js";
import { requireCatalogAdminRole } from "./catalogCandidateAuthorization.js";

const candidateParamsSchema = z.object({ candidateId: z.string().uuid() });
const browserSmokeBodySchema = z.discriminatedUnion("status", [
  z.object({ coreId: z.enum(BROWSER_CORE_IDS), status: z.literal("passed") }),
  z.object({ coreId: z.enum(BROWSER_CORE_IDS), error: z.string().trim().min(1).max(1000), status: z.literal("failed") }),
]);
type Options = { fetchArtifact: typeof fetch; limiter: RateLimiter; requireUser: typeof requireSupabaseUser; service: SupabaseServiceLike | null; ticketSecret: string | undefined; ticketTtlSeconds: number };

export function registerBrowserSmokeRoutes(app: FastifyInstance, options: Options) {
  const { fetchArtifact, limiter, requireUser, service, ticketSecret, ticketTtlSeconds } = options;
  const useCases = service && ticketSecret ? createBrowserSmokeUseCases({
    authorize: async (userId) => (await requireCatalogAdminRole(service, userId)).ok,
    claim: (input) => claimBrowserSmokeArtifact(service, input),
    fetchArtifact: (candidate) => fetchVerifiedCandidateArtifact(candidate, fetchArtifact, service),
    find: (candidateId) => findCandidate(service, candidateId),
    record: (input) => recordBrowserSmokeResult(service, input as Parameters<typeof recordBrowserSmokeResult>[1]),
    ticketSecret,
    ticketTtlSeconds,
  }) : null;

  const limit = async (request: FastifyRequest, reply: FastifyReply) => rejectRateLimitedRequest(reply, await limiter.consume(request.ip), "Browser smoke rate limit reached. Please try again shortly.");

  app.post("/admin/catalog-candidates/:candidateId/browser-smoke-ticket", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    if (!service) return reply.status(503).send({ error: "Supabase service client is not configured for the API." });
    const params = candidateParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid candidate" });
    if (!useCases) return reply.status(503).send({ error: "Browser smoke tickets are not configured for the API." });
    try {
      const result = await useCases.issue({ candidateId: params.data.candidateId, userId: user.id });
      if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
      if (result.status === "not_found") return reply.status(404).send({ error: "Candidate not found" });
      if (result.status === "ineligible") return reply.status(422).send({ error: result.error });
      if (result.status === "incomplete") return reply.status(422).send({ error: "Candidate evidence is incomplete." });
      return reply.header("Cache-Control", "no-store").send(result.ticket);
    } catch (err) {
      request.log.error({ err }, "Failed to create browser smoke ticket");
      return reply.status(500).send({ error: "Failed to create browser smoke ticket" });
    }
  });

  app.get("/browser-smoke/session", async (request, reply) => {
    if (await limit(request, reply)) return;
    if (!service) return reply.status(503).send({ error: "Supabase service client is not configured for the API." });
    if (!useCases) return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    try {
      const result = await useCases.session(request.headers.authorization);
      if (result.status === "not_found") return reply.status(404).send({ error: "Candidate not found" });
      if (result.status === "used") return reply.status(409).send({ error: "This smoke ticket has already been used." });
      if (result.status === "changed") return reply.status(422).send({ error: "Candidate evidence changed after this smoke ticket was issued." });
      return reply.header("Cache-Control", "no-store").send(result.session);
    } catch (err) {
      return reply.status(401).send({ error: err instanceof Error ? err.message : "Invalid smoke ticket" });
    }
  });

  app.get("/browser-smoke/artifact", async (request, reply) => {
    if (await limit(request, reply)) return;
    if (!useCases) return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    try {
      const result = await useCases.artifact(request.headers.authorization);
      if (result.status === "artifact_used") return reply.status(409).send({ error: "This smoke ticket has already fetched its artifact." });
      if (result.status === "not_found") return reply.status(404).send({ error: "Candidate not found" });
      if (result.status === "used") return reply.status(409).send({ error: "This smoke ticket has already been used." });
      if (result.status === "changed") return reply.status(422).send({ error: "Candidate evidence changed." });
      return reply.header("Cache-Control", "no-store").header("Content-Length", String(result.bytes.length)).type("application/octet-stream").send(result.bytes);
    } catch (err) {
      if (err instanceof BrowserSmokeClaimError) {
        request.log.error({ err }, "Failed to claim browser smoke artifact");
        return reply.status(500).send({ error: "Failed to authorize smoke artifact" });
      }
      if (err instanceof CandidateValidationError) return reply.status(422).send({ error: err.message });
      return reply.status(401).send({ error: err instanceof Error ? err.message : "Invalid smoke ticket" });
    }
  });

  app.post("/browser-smoke/result", async (request, reply) => {
    if (await limit(request, reply)) return;
    if (!useCases) return reply.status(503).send({ error: "Browser smoke tickets are not configured." });
    const body = browserSmokeBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid browser smoke result" });
    try {
      const result = await useCases.record(request.headers.authorization, body.data);
      if (result.status === "not_found") return reply.status(404).send({ error: "Candidate not found" });
      if (result.status === "used") return reply.status(409).send({ error: "This smoke ticket has already been used." });
      if (result.status === "changed") return reply.status(422).send({ error: "Candidate evidence changed." });
      return { candidate: result.candidate };
    } catch (err) {
      request.log.error({ err }, "Failed to record browser smoke result");
      if (err instanceof CandidateValidationError) return reply.status(422).send({ error: err.message });
      if (err instanceof Error && /ticket/i.test(err.message)) return reply.status(401).send({ error: err.message });
      return reply.status(500).send({ error: "Failed to record browser smoke result" });
    }
  });
}
