import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../modules/auth/supabaseAuth.js";

const submissionBodySchema = z.object({
  authorName: z.string().trim().min(1).max(120),
  bannerUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  email: z.string().trim().email().max(254),
  gameTitle: z.string().trim().min(1).max(160),
  romUrl: z.string().url(),
});

const SUBMISSION_RATE_LIMIT = 3;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000;

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

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type SubmissionRouteOptions = {
  notifySubmission?: (submission: z.infer<typeof submissionBodySchema>) => Promise<void>;
  requireUser?: typeof requireSupabaseUser;
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

async function defaultNotifySubmission(
  submission: z.infer<typeof submissionBodySchema>,
) {
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
    }),
  });

  if (!response.ok) {
    throw new Error(`Formspree notification failed with ${response.status}`);
  }
}

export async function registerSubmissionRoutes(
  app: FastifyInstance,
  options: SubmissionRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const notifySubmission = options.notifySubmission || defaultNotifySubmission;

  app.post(
    "/submissions/games",
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

      if (!submission.romUrl.toLowerCase().endsWith(".nes")) {
        return reply.status(400).send({ error: "ROM URL must point to a .nes file" });
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
          author_name: submission.authorName,
          banner_url: normalizeOptionalUrl(submission.bannerUrl),
          cover_url: normalizeOptionalUrl(submission.coverUrl),
          description: submission.description || null,
          email: submission.email,
          game_title: submission.gameTitle,
          rom_url: submission.romUrl,
          submitter_id: user.id,
        })
        .select("id")
        .single<{ id: string }>();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to create game submission");
        return reply.status(500).send({ error: "Failed to create submission" });
      }

      try {
        await notifySubmission(submission);
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
