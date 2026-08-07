export function isSuperAdminRole(role: string | null | undefined) {
  return role === "super_admin";
}

export function canModifyUser(
  actorId: string,
  targetId: string,
  targetRole: string | null | undefined,
) {
  if (actorId === targetId) return { allowed: false, reason: "self" } as const;
  if (targetRole === "super_admin") {
    return { allowed: false, reason: "super_admin" } as const;
  }
  return { allowed: true } as const;
}
