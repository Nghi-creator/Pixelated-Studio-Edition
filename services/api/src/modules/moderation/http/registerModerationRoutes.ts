import type { FastifyInstance } from "fastify";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { getAuthoritativeUserRole } from "../../auth/infrastructure/roleAuthorization.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import { createRateLimiter } from "../../security/sharedRateLimiter.js";
import { requireAuthenticatedService } from "../../security/authenticatedService.js";
import { createResolveModerationReport } from "../application/resolveModerationReport.js";
import { createListModerationReports } from "../application/listModerationReports.js";
import {
  deleteReport,
  findCommentAuthor,
  findModerationProfile,
  findModerationReports,
  findReport,
  insertCommentReport,
  resolveReportTransaction,
} from "../infrastructure/supabaseModerationRepository.js";
import {
  adminReportActionSchema,
  adminReportParamsSchema,
  adminReportsQuerySchema,
  commentParamsSchema,
  reportBodySchema,
} from "./contracts.js";

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type ModerationRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function errorCode(error: unknown) {
  return (error as { code?: string } | null)?.code;
}

function errorMessage(error: unknown) {
  return (error as { message?: string } | null)?.message;
}

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
  const resolveReport = service
    ? createResolveModerationReport({
        deleteReport: (reportId) => deleteReport(service, reportId),
        findCommentAuthor: (commentId) => findCommentAuthor(service, commentId),
        findProfile: (userId) => findModerationProfile(service, userId),
        findReport: (reportId) => findReport(service, reportId),
        resolve: (input) => resolveReportTransaction(service, input),
      })
    : null;
  const listReports = service ? createListModerationReports({
    findRole: async (userId) => {
      const lookup = await getAuthoritativeUserRole(service, userId);
      if (lookup.error) throw lookup.error;
      return lookup.role;
    },
    findReports: (query) => findModerationReports(service, query),
  }) : null;

  app.post(
    "/moderation/comments/:commentId/report",
    { preHandler: requireUser },
    async (request, reply) => {
      const context = requireAuthenticatedService(request, reply, service);
      if (!context) return;
      const { service: authenticatedService, user } = context;
      const params = commentParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid comment id" });
      const body = reportBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Report reason is required" });
      }
      if (
        rejectRateLimitedRequest(
          reply,
          await reportWriteLimiter.consume(user.id),
          "Report limit reached. Please try again later.",
        )
      ) return;

      try {
        await insertCommentReport(authenticatedService, {
          commentId: params.data.commentId,
          reason: body.data.reason,
          reporterId: user.id,
        });
        return { success: true };
      } catch (error) {
        if (errorCode(error) === "23505") {
          return reply.status(409).send({
            error: "You have already reported this comment. Our moderators are reviewing it.",
          });
        }
        request.log.error(error, "Failed to submit comment report");
        return reply.status(500).send({ error: "Failed to submit report" });
      }
    },
  );

  app.get("/admin/reports", { preHandler: requireUser }, async (request, reply) => {
    const context = requireAuthenticatedService(request, reply, service);
    if (!context) return;
    const { user } = context;

    const query = adminReportsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Invalid reports query" });
    try {
      const result = await listReports!({ ...query.data, userId: user.id });
      if (result.status === "forbidden") return reply.status(403).send({ error: "Admin access required" });
      return { page: result.page, pageSize: result.pageSize, reports: result.reports, targetRole: result.targetRole, total: result.total, totalPages: result.totalPages };
    } catch (error) {
      request.log.error(error, "Failed to load moderation reports");
      return reply.status(500).send({ error: "Failed to load reports" });
    }
  });

  app.post(
    "/admin/reports/:reportId/action",
    { preHandler: requireUser },
    async (request, reply) => {
      const context = requireAuthenticatedService(request, reply, service);
      if (!context || !resolveReport) return;
      const { user } = context;
      const params = adminReportParamsSchema.safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Invalid report id" });
      const body = adminReportActionSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "Invalid report action" });

      try {
        const result = await resolveReport({
          action: body.data.action,
          actorId: user.id,
          reportId: params.data.reportId,
        });
        if (result.status === "admin_required") {
          return reply.status(403).send({ error: "Admin access required" });
        }
        if (result.status === "report_not_found") {
          return reply.status(404).send({ error: "Report not found" });
        }
        if (result.status === "own_report_forbidden") {
          return reply.status(403).send({
            error: "Another admin must review reports you submitted",
          });
        }
        if (result.status === "comment_not_found") {
          return reply.status(404).send({ error: "Comment not found" });
        }
        if (result.status === "target_role_forbidden") {
          return reply.status(403).send({
            error: "Only super admins can resolve reports against admins",
          });
        }
        if (result.status === "self_ban_forbidden") {
          return reply.status(403).send({ error: "Admins cannot ban themselves" });
        }
        return {
          action: result.action,
          commentId: result.commentId,
          reportId: result.reportId,
          success: true,
          ...(result.action === "ignore" ? {} : { targetUserId: result.targetUserId }),
        };
      } catch (error) {
        request.log.error(error, "Failed to resolve reported comment");
        if (
          ["comment_not_found", "report_not_found", "target_user_not_found"].includes(
            errorMessage(error) || "",
          )
        ) return reply.status(404).send({ error: "Report target not found" });
        return reply.status(500).send({ error: "Failed to resolve report" });
      }
    },
  );
}
