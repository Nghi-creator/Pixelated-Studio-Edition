import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createGameSubmissionUseCase,
  type GameSubmissionInput,
} from "../application/createGameSubmission.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { SUPPORTED_SUBMISSION_ROM_LABEL } from "../domain/submissionRom.js";
import {
  createSignedSubmissionUrl,
  getSubmissionObjectPath,
} from "../infrastructure/submissionStorage.js";
import { notifyGameSubmission } from "../infrastructure/formspreeSubmissionNotifier.js";
import {
  countRecentSubmissions,
  findSubmitterRole,
  insertGameSubmission,
} from "../infrastructure/supabaseSubmissionRepository.js";

const submissionBodySchema = z.object({
  assetLicenseSpdx: z.string().trim().max(80).nullable().optional(),
  attributionText: z.string().trim().min(1).max(2000),
  authorName: z.string().trim().min(1).max(120),
  bannerUrl: z.string().url().nullable().optional(),
  codeLicenseSpdx: z.string().trim().max(80).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  email: z.string().trim().email().max(254),
  gameTitle: z.string().trim().min(1).max(160),
  hostingConfirmed: z.literal(true),
  hostingPermission: z.enum(["creator_permission", "license_allows"]),
  licenseUrl: z.string().url().nullable().optional(),
  noReleaseUrlExplanation: z.string().trim().max(1000).nullable().optional(),
  originalReleaseUrl: z.string().url().nullable().optional(),
  ownershipConfirmed: z.literal(true),
  ownershipStatus: z.enum(["creator", "permission", "public_project", "other"]),
  permissionEvidenceUrl: z.string().url().nullable().optional(),
  publicLicenseScope: z.enum([
    "none_owned",
    "code",
    "assets",
    "everything",
    "not_sure",
  ]),
  romUrl: z.string().url(),
  rightsConfirmed: z.literal(true),
  rightsNotes: z.string().trim().max(2000).nullable().optional(),
  sourceRepoUrl: z.string().url().nullable().optional(),
  thirdPartyContent: z.enum(["no", "yes", "not_sure"]),
}).superRefine((submission, ctx) => {
  if (!submission.originalReleaseUrl && !submission.noReleaseUrlExplanation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Original release URL or explanation is required",
      path: ["originalReleaseUrl"],
    });
  }
  if (
    submission.ownershipStatus === "permission" &&
    !submission.permissionEvidenceUrl
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Permission evidence URL is required",
      path: ["permissionEvidenceUrl"],
    });
  }
  if (
    (submission.ownershipStatus === "public_project" ||
      submission.hostingPermission === "license_allows" ||
      !["none_owned", "not_sure"].includes(submission.publicLicenseScope)) &&
    !submission.sourceRepoUrl
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Source or evidence URL is required",
      path: ["sourceRepoUrl"],
    });
  }
  if (
    ["code", "everything"].includes(submission.publicLicenseScope) &&
    !submission.codeLicenseSpdx
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Code license SPDX is required",
      path: ["codeLicenseSpdx"],
    });
  }
  if (
    ["assets", "everything"].includes(submission.publicLicenseScope) &&
    !submission.assetLicenseSpdx
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Asset license SPDX is required",
      path: ["assetLicenseSpdx"],
    });
  }
  if (
    ["yes", "not_sure"].includes(submission.thirdPartyContent) &&
    !submission.rightsNotes &&
    !submission.permissionEvidenceUrl
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Third-party content needs notes or evidence",
      path: ["rightsNotes"],
    });
  }
});

type SubmissionPayload = z.infer<typeof submissionBodySchema>;

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type SubmissionRouteOptions = {
  notifySubmission?: (submission: SubmissionPayload) => Promise<void>;
  requireUser?: typeof requireSupabaseUser;
  submissionWriteLimiter?: RateLimiter;
  supabase?: SupabaseServiceLike | null;
};

export async function registerSubmissionRoutes(
  app: FastifyInstance,
  options: SubmissionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const notifySubmission = options.notifySubmission || notifyGameSubmission;
  const submissionWriteLimiter =
    options.submissionWriteLimiter ||
    createRateLimiter({
      limit: 10,
      namespace: "submission-write-user",
      windowMs: 60 * 60 * 1000,
    });
  const createSubmission = service
    ? createGameSubmissionUseCase({
        countRecent: (userId, createdAfter) =>
          countRecentSubmissions(service, userId, createdAfter),
        findRole: (userId) => findSubmitterRole(service, userId),
        insert: (values) => insertGameSubmission(service, values),
        isOwnedStorageUrl: (url, userId) =>
          getSubmissionObjectPath(url)?.startsWith(`${userId}/`) === true,
        now: Date.now,
        notify: notifySubmission,
        signUrl: (url) => createSignedSubmissionUrl(service, url),
      })
    : null;

  app.post(
    "/submissions/games",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await submissionWriteLimiter.consume(user.id),
          "Submission rate limit reached. Please try again later.",
        )
      ) {
        return;
      }

      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const parsedBody = submissionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid game submission" });
      }

      try {
        const result = await createSubmission!({
          submission: parsedBody.data as GameSubmissionInput,
          userId: user.id,
        });
        if (result.status === "role_forbidden") {
          return reply.status(403).send({ error: "Super admins cannot submit games for review" });
        }
        if (result.status === "unsupported_rom") {
        return reply.status(400).send({
          error: `ROM URL must point to a supported game file: ${SUPPORTED_SUBMISSION_ROM_LABEL}`,
        });
        }
        if (result.status === "unowned_files") {
        return reply.status(400).send({
          error: "Submission files must be uploaded to your submissions folder",
        });
        }
        if (result.status === "rate_limited") {
        return reply.status(429).send({
          error: "Submission limit reached. Please try again later.",
        });
        }
        if (result.notificationError) {
          request.log.warn({ err: result.notificationError }, "Failed to send submission notification");
        }
        return reply.status(201).send({ submission: { id: result.id, status: "pending" } });
      } catch (error) {
        request.log.error({ err: error }, "Failed to create game submission");
        return reply.status(500).send({ error: "Failed to create submission" });
      }
    },
  );
}
