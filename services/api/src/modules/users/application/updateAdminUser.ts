import { canModifyUser, isSuperAdminRole } from "../domain/adminUserPolicy.js";

export function createUpdateAdminUser(dependencies: {
  findRole(userId: string): Promise<string | null>;
  update(
    userId: string,
    values: { is_banned?: boolean; role?: "admin" | "user" },
  ): Promise<unknown>;
}) {
  return async function updateAdminUser(input: {
    actorId: string;
    targetId: string;
    values: { is_banned?: boolean; role?: "admin" | "user" };
  }) {
    if (!isSuperAdminRole(await dependencies.findRole(input.actorId))) {
      return { allowed: false as const, reason: "actor" as const };
    }
    const targetRole = await dependencies.findRole(input.targetId);
    const authorization = canModifyUser(input.actorId, input.targetId, targetRole);
    if (!authorization.allowed) return authorization;
    return {
      allowed: true as const,
      user: await dependencies.update(input.targetId, input.values),
    };
  };
}

export function createListAdminUsers<User>(dependencies: {
  findRole(userId: string, timings: Record<string, number>): Promise<string | null>;
  findUsers(query: { end: number; search?: string; start: number }, timings: Record<string, number>): Promise<{ users: User[]; total: number }>;
}) {
  return async (input: { page: number; pageSize: number; search?: string; timings: Record<string, number>; userId: string }) => {
    if (!isSuperAdminRole(await dependencies.findRole(input.userId, input.timings))) return { status: "forbidden" } as const;
    const result = await dependencies.findUsers({ end: input.page * input.pageSize - 1, search: input.search, start: (input.page - 1) * input.pageSize }, input.timings);
    return { status: "ok", page: input.page, pageSize: input.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / input.pageSize)), users: result.users } as const;
  };
}
