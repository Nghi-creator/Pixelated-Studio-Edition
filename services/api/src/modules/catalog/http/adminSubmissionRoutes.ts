import crypto from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCachedUserRole } from "../../auth/roleCache.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  CANDIDATE_COLUMNS,
  type CandidateRow,
  type SupabaseServiceLike,
} from "../ingestion/catalogCandidatePromotion.js";

const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).default("pending"),
});
const submissionParamsSchema = z.object({ submissionId: z.string().uuid() });
const submissionReviewBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reject"),
    notes: z.string().trim().min(1).max(2000),
  }),
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
const SUBMISSION_REVIEW_ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
const SUBMISSION_REVIEW_ARTIFACT_TIMEOUT_MS = 15_000;

type SubmissionRow = {
  author_name: string;
  banner_url: string | null;
  catalog_candidate_id?: string | null;
  cover_url: string | null;
  created_at: string;
  description: string | null;
  email: string;
  game_title: string;
  id: string;
  review_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rom_url: string;
  status: string;
  submitter_id: string | null;
};

type AdminSubmissionRouteOptions = {
  adminSubmissionReviewLimiter?: RateLimiter;
  fetchArtifact?: typeof fetch;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function candidateSourceRevisionFor(submission: SubmissionRow) {
  return crypto
    .createHash("sha1")
    .update(["user_submission", submission.id, submission.rom_url].join("\0"))
    .digest("hex");
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function getSubmissionPlatform(filenameOrUrl: string) {
  const extension = path.extname(new URL(filenameOrUrl).pathname).toLowerCase();
  if (extension === ".nes") {
    return { platformId: "nes", runtimeId: "mesen" };
  }
  if (extension === ".gb") {
    return { platformId: "gb", runtimeId: "mgba" };
  }
  if (extension === ".gbc") {
    return { platformId: "gbc", runtimeId: "mgba" };
  }
  if (extension === ".gba") {
    return { platformId: "gba", runtimeId: "mgba" };
  }
  if (extension === ".sfc" || extension === ".smc") {
    return { platformId: "snes", runtimeId: "bsnes" };
  }
  if (extension === ".md" || extension === ".gen") {
    return { platformId: "genesis", runtimeId: "picodrive" };
  }
  if (extension === ".sms") {
    return { platformId: "sms", runtimeId: "picodrive" };
  }
  if (extension === ".gg") {
    return { platformId: "game_gear", runtimeId: "picodrive" };
  }
  return null;
}

function artifactFilenameFor(url: string) {
  const parsed = new URL(url);
  const filename = path.basename(parsed.pathname);
  return filename || "submission.rom";
}

async function readArtifactResponse(
  response: Response,
  maxBytes = SUBMISSION_REVIEW_ARTIFACT_MAX_BYTES,
) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Submitted ROM is too large. Max size is ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function fetchSubmissionArtifactBytes(
  fetchArtifact: typeof fetch,
  url: string,
  maxBytes = SUBMISSION_REVIEW_ARTIFACT_MAX_BYTES,
  timeoutMs = SUBMISSION_REVIEW_ARTIFACT_TIMEOUT_MS,
) {
  const response = await fetchArtifact(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch submitted ROM: status ${response.status}`);
  }

  return readArtifactResponse(response, maxBytes);
}

async function requireAdminRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const roleLookup = await getCachedUserRole(service, userId);
  if (roleLookup.error) throw roleLookup.error;
  return ["admin", "super_admin"].includes(roleLookup.role || "");
}

export async function registerAdminSubmissionRoutes(
  app: FastifyInstance,
  options: AdminSubmissionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const fetchArtifact = options.fetchArtifact || fetch;
  const adminSubmissionReviewLimiter =
    options.adminSubmissionReviewLimiter ||
    createRateLimiter({
      limit: 30,
      namespace: "admin-submission-review-user",
      windowMs: 60_000,
    });

  app.get(
    "/admin/submissions",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await adminSubmissionReviewLimiter.consume(user.id),
          "Admin submission review rate limit reached. Please try again shortly.",
        )
      ) {
        return;
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      try {
        const isAdmin = await requireAdminRole(service, user.id);
        if (!isAdmin) {
          return reply.status(403).send({ error: "Admin access required" });
        }
      } catch (err) {
        request.log.error({ err }, "Failed to authorize submissions");
        return reply.status(500).send({ error: "Failed to authorize submissions" });
      }

      const parsedQuery = submissionQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid submission query" });
      }

      const { page, pageSize, search, status } = parsedQuery.data;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      let query = service
        .from("game_submissions")
        .select("*", { count: "exact" })
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(start, end);
      if (search) query = query.ilike("game_title", `%${search}%`);

      const { count, data, error } = await query;
      if (error) {
        request.log.error({ err: error }, "Failed to load submissions");
        return reply.status(500).send({ error: "Failed to load submissions" });
      }

      const total = count || 0;
      return {
        page,
        pageSize,
        submissions: data || [],
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  app.patch(
    "/admin/submissions/:submissionId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await adminSubmissionReviewLimiter.consume(user.id),
          "Admin submission review rate limit reached. Please try again shortly.",
        )
      ) {
        return;
      }
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const params = submissionParamsSchema.safeParse(request.params);
      const body = submissionReviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid submission review" });
      }

      try {
        const isAdmin = await requireAdminRole(service, user.id);
        if (!isAdmin) {
          return reply.status(403).send({ error: "Admin access required" });
        }

        const { data: submission, error: submissionError } = await service
          .from("game_submissions")
          .select("*")
          .eq("id", params.data.submissionId)
          .maybeSingle<SubmissionRow>();
        if (submissionError) throw submissionError;
        if (!submission) {
          return reply.status(404).send({ error: "Submission not found" });
        }
        if (submission.status !== "pending") {
          return reply.status(409).send({ error: "Submission already reviewed" });
        }

        const now = new Date().toISOString();
        if (body.data.action === "reject") {
          const { data, error } = await service
            .from("game_submissions")
            .update({
              review_notes: body.data.notes,
              reviewed_at: now,
              reviewed_by: user.id,
              status: "rejected",
              updated_at: now,
            })
            .eq("id", submission.id)
            .select("*")
            .single<SubmissionRow>();
          if (error) throw error;
          return { submission: data };
        }

        const platform = getSubmissionPlatform(submission.rom_url);
        if (!platform) {
          return reply.status(422).send({ error: "Unsupported submitted ROM type" });
        }

        const artifactBytes = await fetchSubmissionArtifactBytes(
          fetchArtifact,
          submission.rom_url,
        );
        const artifactFilename = artifactFilenameFor(submission.rom_url);
        const sourceCommit = candidateSourceRevisionFor(submission);

        const candidatePayload = {
          artifact_filename: artifactFilename,
          artifact_sha256: sha256(artifactBytes),
          artifact_size: artifactBytes.length,
          artifact_url: submission.rom_url,
          asset_license_spdx: body.data.asset_license_spdx || null,
          attribution_text: body.data.attribution_text,
          code_license_spdx: body.data.code_license_spdx,
          cover_license_spdx: null,
          developer_name: submission.author_name,
          developer_url: body.data.original_release_url || body.data.source_repo_url,
          import_status: "needs_review",
          last_seen_at: now,
          license_url: body.data.license_url,
          noncommercial_hosting_allowed: body.data.noncommercial_hosting_allowed,
          original_release_url:
            body.data.original_release_url || body.data.source_repo_url,
          permission_evidence_url: body.data.permission_evidence_url || null,
          platform_id: platform.platformId,
          rights_warnings: body.data.rights_warnings,
          runtime_id: platform.runtimeId,
          runtime_kind: "libretro",
          source_commit: sourceCommit,
          source_entry_path: `game_submissions/${submission.id}#${artifactFilename}`,
          source_kind: "user_submission",
          source_metadata: {
            bannerUrl: submission.banner_url,
            coverUrl: submission.cover_url,
            description: submission.description,
            email: submission.email,
            submitterId: submission.submitter_id,
          },
          source_repo_url: body.data.source_repo_url,
          title: submission.game_title,
        };

        const { data: candidate, error: candidateError } = await service
          .from("catalog_ingestion_candidates")
          .insert(candidatePayload)
          .select(CANDIDATE_COLUMNS)
          .single<CandidateRow>();
        if (candidateError) throw candidateError;

        const { data: updatedSubmission, error: updateError } = await service
          .from("game_submissions")
          .update({
            catalog_candidate_id: candidate.id,
            review_notes: body.data.notes || null,
            reviewed_at: now,
            reviewed_by: user.id,
            status: "candidate_created",
            updated_at: now,
          })
          .eq("id", submission.id)
          .select("*")
          .single<SubmissionRow>();
        if (updateError) throw updateError;

        return { candidate, submission: updatedSubmission };
      } catch (err) {
        request.log.error({ err }, "Failed to review submission");
        if (err instanceof Error && err.message.includes("too large")) {
          return reply.status(413).send({ error: err.message });
        }
        if (err instanceof Error && err.message.startsWith("Failed to fetch")) {
          return reply.status(502).send({ error: "Failed to fetch submitted ROM" });
        }
        return reply.status(500).send({ error: "Failed to review submission" });
      }
    },
  );
}
