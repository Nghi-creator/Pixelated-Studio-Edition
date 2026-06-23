export function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export function canReviewOwnReport(
  actorRole: string | null | undefined,
  actorId: string,
  reporterId: string | null,
) {
  return reporterId !== actorId || actorRole === "super_admin";
}

export function canResolveTargetRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
) {
  return !isAdminRole(targetRole) || actorRole === "super_admin";
}

export function getPageRange(page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { end: start + pageSize - 1, start };
}
