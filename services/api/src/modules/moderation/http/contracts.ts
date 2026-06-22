import { z } from "zod";

export const commentParamsSchema = z.object({ commentId: z.string().uuid() });
export const reportBodySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export const adminReportParamsSchema = z.object({
  reportId: z.string().uuid(),
});
export const adminReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  targetRole: z.enum(["all", "users", "admins"]).default("all"),
});
export const adminReportActionSchema = z.object({
  action: z.enum(["ban_user", "delete_comment", "ignore"]),
});
