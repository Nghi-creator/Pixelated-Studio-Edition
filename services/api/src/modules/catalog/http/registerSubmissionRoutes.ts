import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { createRateLimiter, type RateLimiter } from "../../security/sharedRateLimiter.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";

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

const SUBMISSION_RATE_LIMIT = 3;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000;
const SUPPORTED_SUBMISSION_ROM_EXTENSIONS = [
  ".nes",
  ".gb",
  ".gbc",
  ".gba",
  ".sfc",
  ".smc",
  ".md",
  ".gen",
  ".sms",
  ".gg",
];
const SUPPORTED_SUBMISSION_ROM_LABEL =
  ".nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, or .gg";
const SUBMISSION_REVIEW_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

type SubmissionPayload = z.infer<typeof submissionBodySchema>;

function normalizeOptionalUrl(value: string | null | undefined) {
  return value || null;
}

function getSubmissionObjectPath(url: string) {
  const storagePathPrefix = "/storage/v1/object/public/submissions/";
  if (!env.SUPABASE_URL) {
    const parsedUrl = new URL(url);
    if (!parsedUrl.pathname.startsWith(storagePathPrefix)) return null;

    return decodeURIComponent(
      parsedUrl.pathname.slice(storagePathPrefix.length),
    );
  }

  const normalizedSupabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const prefix = `${normalizedSupabaseUrl}/storage/v1/object/public/submissions/`;
  if (!url.startsWith(prefix)) return null;

  return decodeURIComponent(url.slice(prefix.length));
}

function isSubmissionStorageUrl(url: string, userId: string) {
  const objectPath = getSubmissionObjectPath(url);
  if (!objectPath) return false;

  return objectPath.startsWith(`${userId}/`);
}

function getSubmissionRomExtension(url: string) {
  const objectPath = getSubmissionObjectPath(url);
  if (!objectPath) return null;

  const lowerObjectPath = objectPath.toLowerCase();
  return (
    SUPPORTED_SUBMISSION_ROM_EXTENSIONS.find((extension) =>
      lowerObjectPath.endsWith(extension),
    ) || null
  );
}

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type SubmissionRouteOptions = {
  notifySubmission?: (submission: SubmissionPayload) => Promise<void>;
  requireUser?: typeof requireSupabaseUser;
  submissionWriteLimiter?: RateLimiter;
  supabase?: SupabaseServiceLike | null;
};

async function getSubmitterRole(
  service: SupabaseServiceLike,
  userId: string,
) {
  const { data, error } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();

  if (error) throw error;

  return data?.role || "user";
}

async function defaultNotifySubmission(submission: SubmissionPayload) {
  if (!env.FORMSPREE_SUBMISSION_URL) return;

  const response = await fetch(env.FORMSPREE_SUBMISSION_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: `New Game Submission: ${submission.gameTitle}`,
      developer: submission.authorName,
      contact_email: submission.email,
      game: submission.gameTitle,
      description: submission.description || "No description provided.",
      rom_download: submission.romUrl,
      cover_art: submission.coverUrl || "None provided",
      banner_art: submission.bannerUrl || "None provided",
      rights: {
        asset_license_spdx: submission.assetLicenseSpdx || null,
        attribution_text: submission.attributionText,
        code_license_spdx: submission.codeLicenseSpdx || null,
        hosting_permission: submission.hostingPermission,
        license_url: submission.licenseUrl || null,
        original_release_url: submission.originalReleaseUrl || null,
        ownership_status: submission.ownershipStatus,
        permission_evidence_url: submission.permissionEvidenceUrl || null,
        public_license_scope: submission.publicLicenseScope,
        rights_notes: submission.rightsNotes || null,
        source_repo_url: submission.sourceRepoUrl || null,
        third_party_content: submission.thirdPartyContent,
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Formspree notification failed with ${response.status}`);
  }
}

async function createSignedSubmissionUrl(
  service: SupabaseServiceLike,
  url: string | null | undefined,
) {
  if (!url) return null;

  const objectPath = getSubmissionObjectPath(url);
  if (!objectPath) return url;

  const { data, error } = await service.storage
    .from("submissions")
    .createSignedUrl(objectPath, SUBMISSION_REVIEW_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error("Missing signed URL");

  return data.signedUrl;
}

async function createReviewNotificationSubmission(
  service: SupabaseServiceLike,
  submission: SubmissionPayload,
): Promise<SubmissionPayload> {
  const [romUrl, coverUrl, bannerUrl] = await Promise.all([
    createSignedSubmissionUrl(service, submission.romUrl),
    createSignedSubmissionUrl(service, submission.coverUrl),
    createSignedSubmissionUrl(service, submission.bannerUrl),
  ]);

  return {
    ...submission,
    bannerUrl,
    coverUrl,
    romUrl: romUrl || submission.romUrl,
  };
}

export async function registerSubmissionRoutes(
  app: FastifyInstance,
  options: SubmissionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const notifySubmission = options.notifySubmission || defaultNotifySubmission;
  const submissionWriteLimiter =
    options.submissionWriteLimiter ||
    createRateLimiter({
      limit: 10,
      namespace: "submission-write-user",
      windowMs: 60 * 60 * 1000,
    });

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

      let submitterRole = "user";
      try {
        submitterRole = await getSubmitterRole(service, user.id);
      } catch (err) {
        request.log.error({ err }, "Failed to load submitter role");
        return reply.status(500).send({ error: "Failed to create submission" });
      }

      if (submitterRole === "super_admin") {
        return reply.status(403).send({
          error: "Super admins cannot submit games for review",
        });
      }

      const parsedBody = submissionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid game submission" });
      }

      const submission = parsedBody.data;
      const urls = [
        submission.romUrl,
        normalizeOptionalUrl(submission.coverUrl),
        normalizeOptionalUrl(submission.bannerUrl),
      ].filter((url): url is string => Boolean(url));

      if (!getSubmissionRomExtension(submission.romUrl)) {
        return reply.status(400).send({
          error: `ROM URL must point to a supported game file: ${SUPPORTED_SUBMISSION_ROM_LABEL}`,
        });
      }

      if (!urls.every((url) => isSubmissionStorageUrl(url, user.id))) {
        return reply.status(400).send({
          error: "Submission files must be uploaded to your submissions folder",
        });
      }

      const rateWindowStart = new Date(
        Date.now() - SUBMISSION_RATE_WINDOW_MS,
      ).toISOString();
      const { count, error: rateError } = await service
        .from("game_submissions")
        .select("id", { count: "exact" })
        .eq("submitter_id", user.id)
        .gte("created_at", rateWindowStart);

      if (rateError) {
        request.log.error({ err: rateError }, "Failed to check submission rate");
        return reply.status(500).send({ error: "Failed to create submission" });
      }

      if ((count || 0) >= SUBMISSION_RATE_LIMIT) {
        return reply.status(429).send({
          error: "Submission limit reached. Please try again later.",
        });
      }

      const { data, error } = await service
        .from("game_submissions")
        .insert({
          asset_license_spdx: submission.assetLicenseSpdx || null,
          attribution_text: submission.attributionText,
          author_name: submission.authorName,
          banner_url: normalizeOptionalUrl(submission.bannerUrl),
          code_license_spdx: submission.codeLicenseSpdx || null,
          cover_url: normalizeOptionalUrl(submission.coverUrl),
          description: submission.description || null,
          email: submission.email,
          game_title: submission.gameTitle,
          hosting_confirmed: submission.hostingConfirmed,
          hosting_permission: submission.hostingPermission,
          license_url: normalizeOptionalUrl(submission.licenseUrl),
          no_release_url_explanation:
            submission.noReleaseUrlExplanation || null,
          original_release_url: normalizeOptionalUrl(
            submission.originalReleaseUrl,
          ),
          ownership_confirmed: submission.ownershipConfirmed,
          ownership_status: submission.ownershipStatus,
          permission_evidence_url: normalizeOptionalUrl(
            submission.permissionEvidenceUrl,
          ),
          public_license_scope: submission.publicLicenseScope,
          rom_url: submission.romUrl,
          rights_confirmed: submission.rightsConfirmed,
          rights_notes: submission.rightsNotes || null,
          source_repo_url: normalizeOptionalUrl(submission.sourceRepoUrl),
          submitter_id: user.id,
          third_party_content: submission.thirdPartyContent,
        })
        .select("id")
        .single<{ id: string }>();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to create game submission");
        return reply.status(500).send({ error: "Failed to create submission" });
      }

      try {
        const reviewSubmission = await createReviewNotificationSubmission(
          service,
          submission,
        );
        await notifySubmission(reviewSubmission);
      } catch (err) {
        request.log.warn({ err }, "Failed to send submission notification");
      }

      return reply.status(201).send({
        submission: {
          id: data.id,
          status: "pending",
        },
      });
    },
  );
}
