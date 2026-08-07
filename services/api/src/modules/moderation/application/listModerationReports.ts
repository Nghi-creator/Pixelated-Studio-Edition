import { getPageRange, isAdminRole } from "../domain/moderationPolicy.js";

export function createListModerationReports(dependencies: {
  findRole(userId: string): Promise<string | null>;
  findReports(query: { end: number; start: number; targetRole: "admins" | "all" | "users" }): Promise<{ reports: unknown[]; total: number }>;
}) {
  return async (input: { page: number; pageSize: number; targetRole: "admins" | "all" | "users"; userId: string }) => {
    if (!isAdminRole(await dependencies.findRole(input.userId))) return { status: "forbidden" } as const;
    const { start, end } = getPageRange(input.page, input.pageSize);
    const result = await dependencies.findReports({ end, start, targetRole: input.targetRole });
    return { status: "ok", page: input.page, pageSize: input.pageSize, reports: result.reports, targetRole: input.targetRole, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / input.pageSize)) } as const;
  };
}
