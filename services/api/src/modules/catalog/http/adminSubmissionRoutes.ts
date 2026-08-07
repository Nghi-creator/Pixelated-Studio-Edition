import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthoritativeUserRole } from "../../auth/infrastructure/roleAuthorization.js";
import { requireSupabaseUser, supabaseService } from "../../auth/http/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import {
  createAdminSubmissionUseCases,
  fetchSubmissionArtifactBytes,
} from "../application/adminSubmissions.js";
import { createSignedSubmissionUrl } from "../infrastructure/submissionStorage.js";
import {
  createSubmissionCandidate,
  findSubmission,
  findSubmissions,
  rejectSubmission,
  SubmissionTransitionError,
} from "../infrastructure/supabaseSubmissionRepository.js";
import type { SupabaseServiceLike } from "../ingestion/infrastructure/supabaseCandidatePromotion.js";

export { fetchSubmissionArtifactBytes };

const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).default("pending"),
});
const submissionParamsSchema = z.object({ submissionId: z.string().uuid() });
const submissionReviewBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject"), notes: z.string().trim().min(1).max(2000) }),
  z.object({
    action: z.literal("create_candidate"),
    asset_license_spdx: z.string().trim().max(80).nullable().optional(),
    attribution_text: z.string().trim().min(1).max(2000),
    code_license_spdx: z.string().trim().min(1).max(80),
    license_url: z.string().trim().url(),
    noncommercial_hosting_allowed: z.literal(true),
    notes: z.string().trim().max(2000).optional(),
    original_release_url: z.string().trim().url().nullable().optional(),
    permission_evidence_url: z.string().trim().url().nullable().optional(),
    rights_warnings: z.array(z.string().trim().max(500)).max(10).default([]),
    source_repo_url: z.string().trim().url(),
  }),
]);

type AdminSubmissionRouteOptions = {
  adminSubmissionReviewLimiter?: RateLimiter;
  fetchArtifact?: typeof fetch;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

export async function registerAdminSubmissionRoutes(app: FastifyInstance, options: AdminSubmissionRouteOptions = {}) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const limiter = options.adminSubmissionReviewLimiter || createRateLimiter({ limit: 30, namespace: "admin-submission-review-user", windowMs: 60_000 });
  const useCases = service ? createAdminSubmissionUseCases({
    authorize: async (userId) => {
      const lookup = await getAuthoritativeUserRole(service, userId);
      if (lookup.error) throw lookup.error;
      return ["admin", "super_admin"].includes(lookup.role || "");
    },
    createCandidate: (input) => createSubmissionCandidate(service, input),
    fetchArtifact: options.fetchArtifact || fetch,
    findOne: (id) => findSubmission(service, id),
    findPage: (query) => findSubmissions(service, query),
    reject: (input) => rejectSubmission(service, input),
    signUrl: (url) => createSignedSubmissionUrl(service, url),
  }) : null;

  app.get("/admin/submissions", { preHandler: requireUser }, async (request, reply) => {
    const context = requireAuthenticatedService(request, reply, service);
    if (!context) return;
    if (rejectRateLimitedRequest(reply, await limiter.consume(context.user.id), "Admin submission review rate limit reached. Please try again shortly.")) return;
    const query = submissionQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Invalid submission query" });
    try {
      const result = await useCases!.list({ ...query.data, userId: context.user.id });
      if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
      return { page: result.page, pageSize: result.pageSize, submissions: result.submissions, total: result.total, totalPages: result.totalPages };
    } catch (err) {
      request.log.error({ err }, "Failed to load submissions");
      return reply.status(500).send({ error: "Failed to load submissions" });
    }
  });

  app.patch("/admin/submissions/:submissionId", { preHandler: requireUser }, async (request, reply) => {
    const context = requireAuthenticatedService(request, reply, service);
    if (!context) return;
    if (rejectRateLimitedRequest(reply, await limiter.consume(context.user.id), "Admin submission review rate limit reached. Please try again shortly.")) return;
    const params = submissionParamsSchema.safeParse(request.params);
    const body = submissionReviewBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "Invalid submission review" });
    try {
      const result = await useCases!.review({ body: body.data, submissionId: params.data.submissionId, userId: context.user.id });
      if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
      if (result.status === "not_found") return reply.status(404).send({ error: "Submission not found" });
      if (result.status === "already_reviewed") return reply.status(409).send({ error: "Submission already reviewed" });
      if (result.status === "unsupported") return reply.status(422).send({ error: "Unsupported submitted ROM type" });
      if (result.status === "unavailable") return reply.status(422).send({ error: "Submitted ROM is unavailable" });
      if (result.status === "rejected") return { submission: result.submission };
      return { candidate: result.candidate, submission: result.submission };
    } catch (err) {
      request.log.error({ err }, "Failed to review submission");
      if (err instanceof SubmissionTransitionError) return reply.status(err.message === "submission_not_found" ? 404 : 409).send({ error: err.message === "submission_not_found" ? "Submission not found" : "Submission already reviewed" });
      if (err instanceof Error && err.message.includes("too large")) return reply.status(413).send({ error: err.message });
      if (err instanceof Error && err.message.startsWith("Failed to fetch")) return reply.status(502).send({ error: "Failed to fetch submitted ROM" });
      return reply.status(500).send({ error: "Failed to review submission" });
    }
  });
}
