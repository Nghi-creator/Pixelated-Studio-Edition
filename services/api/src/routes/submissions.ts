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

function normalizeOptionalUrl(value: string | null | undefined) {
  return value || null;
}

function isSubmissionStorageUrl(url: string) {
  if (!env.SUPABASE_URL) return true;

  const normalizedSupabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  return url.startsWith(
    `${normalizedSupabaseUrl}/storage/v1/object/public/submissions/`,
  );
}

export async function registerSubmissionRoutes(app: FastifyInstance) {
  app.post(
    "/submissions/games",
    { preHandler: requireSupabaseUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      if (!supabaseService) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
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

      if (!urls.every(isSubmissionStorageUrl)) {
        return reply.status(400).send({
          error: "Submission files must be uploaded to the submissions bucket",
        });
      }

      const { data, error } = await supabaseService
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

      return reply.status(201).send({
        submission: {
          id: data.id,
          status: "pending",
        },
      });
    },
  );
}
