import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export type ReportRecord = {
  comment_id: string | null;
  reporter_id: string | null;
};

export async function insertCommentReport(
  service: SupabaseService,
  input: { commentId: string; reason: string; reporterId: string },
) {
  const { error } = await service.from("reported_comments").insert({
    comment_id: input.commentId,
    reason: input.reason,
    reporter_id: input.reporterId,
  });
  if (error) throw error;
}

export async function findModerationReports(
  service: SupabaseService,
  input: {
    end: number;
    start: number;
    targetRole: "admins" | "all" | "users";
  },
) {
  let query = service
    .from("reported_comments")
    .select(
      `
        id,
        reason,
        created_at,
        comments (id, content, profiles (id, username, role)),
        profiles (id, username)
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (input.targetRole === "admins") {
    query = query.in("comments.profiles.role", ["admin", "super_admin"]);
  } else if (input.targetRole === "users") {
    query = query.not("comments.profiles.role", "in", "(admin,super_admin)");
  }

  const { data, count, error } = await query.range(input.start, input.end);
  if (error) throw error;
  return { reports: data || [], total: count || 0 };
}

export async function findReport(service: SupabaseService, reportId: string) {
  const { data, error } = await service
    .from("reported_comments")
    .select("comment_id, reporter_id")
    .eq("id", reportId)
    .maybeSingle<ReportRecord>();
  if (error) throw error;
  return data;
}

export async function findCommentAuthor(service: SupabaseService, commentId: string) {
  const { data, error } = await service
    .from("comments")
    .select("user_id")
    .eq("id", commentId)
    .maybeSingle<{ user_id: string | null }>();
  if (error) throw error;
  return data?.user_id || null;
}

export async function findModerationProfile(service: SupabaseService, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("role, is_banned")
    .eq("id", userId)
    .maybeSingle<{ is_banned?: boolean; role: string | null }>();
  if (error) throw error;
  return data || null;
}

export async function deleteReport(service: SupabaseService, reportId: string) {
  const { error } = await service.from("reported_comments").delete().eq("id", reportId);
  if (error) throw error;
}

export async function resolveReportTransaction(
  service: SupabaseService,
  input: {
    action: string;
    commentId: string;
    reportId: string;
    targetUserId: string;
  },
) {
  const { error } = await service.rpc("resolve_comment_report", {
    p_action: input.action,
    p_comment_id: input.commentId,
    p_report_id: input.reportId,
    p_target_user_id: input.targetUserId,
  });
  if (error) throw error;
}
