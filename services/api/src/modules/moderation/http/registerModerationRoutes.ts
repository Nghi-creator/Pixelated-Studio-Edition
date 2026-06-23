import type { FastifyInstance } from "fastify";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { getCachedUserRole } from "../../auth/roleCache.js";
import {
  adminReportActionSchema,
  adminReportParamsSchema,
  adminReportsQuerySchema,
  commentParamsSchema,
  reportBodySchema,
} from "./contracts.js";
import {
  canResolveTargetRole,
  canReviewOwnReport,
  getPageRange,
  isAdminRole,
} from "../domain/moderationPolicy.js";
import { logTiming, timed } from "../../observability/timing.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";

type ProfileRole = {
  is_banned?: boolean;
  role: string | null;
};

type ReportRow = {
  comment_id: string | null;
  reporter_id: string | null;
};

type CommentRow = {
  user_id: string | null;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type ModerationRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

export async function registerModerationRoutes(
  app: FastifyInstance,
  options: ModerationRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const reportWriteLimiter = createRateLimiter({
    limit: 10,
    namespace: "report-write",
    windowMs: 60 * 60 * 1000,
  });

  app.post(
    "/moderation/comments/:commentId/report",
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

      const parsedParams = commentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid comment id" });
      }

      const parsedBody = reportBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          error: "Report reason is required",
        });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await reportWriteLimiter.consume(user.id),
          "Report limit reached. Please try again later.",
        )
      ) {
        return;
      }

      const { error } = await service.from("reported_comments").insert({
        comment_id: parsedParams.data.commentId,
        reporter_id: user.id,
        reason: parsedBody.data.reason,
      });

      if (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error:
              "You have already reported this comment. Our moderators are reviewing it.",
          });
        }

        request.log.error(error, "Failed to submit comment report");
        return reply.status(500).send({ error: "Failed to submit report" });
      }

      return { success: true };
    },
  );

  app.get(
    "/admin/reports",
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
      const roleLookup = await timed(
        timings,
        "admin_role_check_ms",
        () => getCachedUserRole(service, user.id),
      );

      if (roleLookup.error) {
        request.log.error(roleLookup.error, "Failed to load moderator profile");
        return reply.status(500).send({ error: "Failed to authorize reports" });
      }

      if (!isAdminRole(roleLookup.role)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const parsedQuery = adminReportsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid reports query" });
      }

      const { page, pageSize, targetRole } = parsedQuery.data;
      const { end, start } = getPageRange(page, pageSize);
      let reportsQuery = service
        .from("reported_comments")
        .select(
          `
              id,
              reason,
              created_at,
              comments (
                id,
                content,
                profiles ( id, username, role )
              ),
              profiles ( id, username )
            `,
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      if (targetRole === "admins") {
        reportsQuery = reportsQuery.in("comments.profiles.role", [
          "admin",
          "super_admin",
        ]);
      } else if (targetRole === "users") {
        reportsQuery = reportsQuery.not(
          "comments.profiles.role",
          "in",
          "(admin,super_admin)",
        );
      }

      const { data, count, error } = await timed(
        timings,
        "admin_reports_query_ms",
        () => reportsQuery.range(start, end),
      );

      if (error) {
        request.log.error(error, "Failed to load moderation reports");
        return reply.status(500).send({ error: "Failed to load reports" });
      }

      const total = count || 0;
      logTiming(request.log, "Admin reports timing", timings, {
        page,
        pageSize,
        resultCount: data?.length || 0,
        roleCache: roleLookup.cache,
        targetRole,
        total,
      });

      return {
        page,
        pageSize,
        reports: data || [],
        targetRole,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  app.post(
    "/admin/reports/:reportId/action",
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

      const parsedParams = adminReportParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ error: "Invalid report id" });
      }

      const parsedBody = adminReportActionSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Invalid report action" });
      }

      const { data: actorProfile, error: actorError } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<ProfileRole>();

      if (actorError) {
        request.log.error(actorError, "Failed to load moderator profile");
        return reply.status(500).send({ error: "Failed to authorize action" });
      }

      if (!isAdminRole(actorProfile?.role)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { data: report, error: reportError } = await service
        .from("reported_comments")
        .select("comment_id, reporter_id")
        .eq("id", parsedParams.data.reportId)
        .maybeSingle<ReportRow>();

      if (reportError) {
        request.log.error(reportError, "Failed to load report");
        return reply.status(500).send({ error: "Failed to load report" });
      }

      if (!report?.comment_id) {
        return reply.status(404).send({ error: "Report not found" });
      }

      if (!canReviewOwnReport(actorProfile?.role, user.id, report.reporter_id)) {
        return reply.status(403).send({
          error: "Another admin must review reports you submitted",
        });
      }

      const { data: comment, error: commentError } = await service
        .from("comments")
        .select("user_id")
        .eq("id", report.comment_id)
        .maybeSingle<CommentRow>();

      if (commentError) {
        request.log.error(commentError, "Failed to load reported comment");
        return reply.status(500).send({ error: "Failed to load comment" });
      }

      if (!comment?.user_id) {
        await service
          .from("reported_comments")
          .delete()
          .eq("id", parsedParams.data.reportId);
        return reply.status(404).send({ error: "Comment not found" });
      }

      const { data: targetProfile, error: targetError } = await service
        .from("profiles")
        .select("role, is_banned")
        .eq("id", comment.user_id)
        .maybeSingle<ProfileRole>();

      if (targetError) {
        request.log.error(targetError, "Failed to load reported user profile");
        return reply.status(500).send({ error: "Failed to load user profile" });
      }

      if (!canResolveTargetRole(actorProfile?.role, targetProfile?.role)) {
        return reply.status(403).send({
          error: "Only super admins can resolve reports against admins",
        });
      }

      if (parsedBody.data.action === "ignore") {
        const { error } = await service
          .from("reported_comments")
          .delete()
          .eq("id", parsedParams.data.reportId);

        if (error) {
          request.log.error(error, "Failed to ignore report");
          return reply.status(500).send({ error: "Failed to ignore report" });
        }

        return {
          action: parsedBody.data.action,
          commentId: report.comment_id,
          reportId: parsedParams.data.reportId,
          success: true,
        };
      }

      if (parsedBody.data.action === "ban_user") {
        if (comment.user_id === user.id) {
          return reply.status(403).send({ error: "Admins cannot ban themselves" });
        }

        const { error } = await service
          .from("profiles")
          .update({ is_banned: true })
          .eq("id", comment.user_id);

        if (error) {
          request.log.error(error, "Failed to ban reported user");
          return reply.status(500).send({ error: "Failed to ban user" });
        }
      }

      const { error: deleteError } = await service
        .from("comments")
        .delete()
        .eq("id", report.comment_id);

      if (deleteError) {
        request.log.error(deleteError, "Failed to delete reported comment");
        return reply.status(500).send({ error: "Failed to delete comment" });
      }

      return {
        action: parsedBody.data.action,
        commentId: report.comment_id,
        reportId: parsedParams.data.reportId,
        success: true,
        targetUserId: comment.user_id,
      };
    },
  );
}
