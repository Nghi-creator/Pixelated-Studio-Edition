import {
  canResolveTargetRole,
  canReviewOwnReport,
  isAdminRole,
} from "../domain/moderationPolicy.js";

type Profile = { role: string | null } | null;
type Report = { comment_id: string | null; reporter_id: string | null } | null;

export function createResolveModerationReport(dependencies: {
  deleteReport(reportId: string): Promise<void>;
  findCommentAuthor(commentId: string): Promise<string | null>;
  findProfile(userId: string): Promise<Profile>;
  findReport(reportId: string): Promise<Report>;
  resolve(input: {
    action: string;
    commentId: string;
    reportId: string;
    targetUserId: string;
  }): Promise<void>;
}) {
  return async function resolveModerationReport(input: {
    action: "ban_user" | "delete_comment" | "ignore";
    actorId: string;
    reportId: string;
  }) {
    const actor = await dependencies.findProfile(input.actorId);
    if (!isAdminRole(actor?.role)) return { status: "admin_required" } as const;

    const report = await dependencies.findReport(input.reportId);
    if (!report?.comment_id) return { status: "report_not_found" } as const;
    if (!canReviewOwnReport(actor?.role, input.actorId, report.reporter_id)) {
      return { status: "own_report_forbidden" } as const;
    }

    const targetUserId = await dependencies.findCommentAuthor(report.comment_id);
    if (!targetUserId) {
      await dependencies.deleteReport(input.reportId);
      return { status: "comment_not_found" } as const;
    }

    const target = await dependencies.findProfile(targetUserId);
    if (!canResolveTargetRole(actor?.role, target?.role)) {
      return { status: "target_role_forbidden" } as const;
    }
    if (input.action === "ban_user" && targetUserId === input.actorId) {
      return { status: "self_ban_forbidden" } as const;
    }
    if (input.action === "ignore") {
      await dependencies.deleteReport(input.reportId);
    } else {
      await dependencies.resolve({
        action: input.action,
        commentId: report.comment_id,
        reportId: input.reportId,
        targetUserId,
      });
    }

    return {
      action: input.action,
      commentId: report.comment_id,
      reportId: input.reportId,
      status: "resolved",
      targetUserId,
    } as const;
  };
}
