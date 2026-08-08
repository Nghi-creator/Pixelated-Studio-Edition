import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { getAuthoritativeUserRole } from "../../auth/infrastructure/roleAuthorization.js";
import { logTiming, timed } from "../../observability/infrastructure/timing.js";
import { createListAdminUsers, createUpdateAdminUser } from "../application/updateAdminUser.js";
import {
  type AdminUserRow,
  findAdminUsers,
  findUserRole,
  updateAdminUser,
} from "../infrastructure/supabaseAdminUserRepository.js";

const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});
const userParamsSchema = z.object({ userId: z.string().uuid() });
const userUpdateSchema = z
  .object({
    is_banned: z.boolean().optional(),
    role: z.enum(["admin", "user"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.is_banned !== undefined);

type SupabaseServiceLike = NonNullable<typeof supabaseService>;
type AdminUserRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function toAdminUser(row: AdminUserRow) {
  return {
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    id: row.id,
    is_banned: row.is_banned,
    role: row.role,
    username: row.username,
  };
}

export async function registerAdminUserRoutes(
  app: FastifyInstance,
  options: AdminUserRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const updateUser = service
    ? createUpdateAdminUser({
        findRole: (userId) => findUserRole(service, userId),
        update: (userId, values) => updateAdminUser(service, userId, values),
      })
    : null;
  const listUsers = service ? createListAdminUsers({
    findRole: async (userId, timings) => {
      const lookup = await timed(timings, "admin_role_check_ms", () =>
        getAuthoritativeUserRole(service, userId),
      );
      if (lookup.error) throw lookup.error;
      return lookup.role;
    },
    findUsers: (query, timings) => timed(
      timings,
      "admin_users_query_ms",
      () => findAdminUsers(service, query),
    ),
  }) : null;

  app.get("/admin/users", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const query = usersQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Invalid users query" });
    try {
      const timings = {};
      const result = await listUsers!({ ...query.data, timings, userId: user.id });
      if (result.status === "forbidden") return reply.status(403).send({ error: "Super admin access required" });
      logTiming(request.log, "Admin users timing", timings, {
        page: result.page,
        pageSize: result.pageSize,
        resultCount: result.users.length,
        roleSource: "database",
        search: Boolean(query.data.search),
        total: result.total,
      });
      return { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages, users: result.users.map(toAdminUser) };
    } catch (error) {
      request.log.error({ err: error }, "Failed to load users");
      return reply.status(500).send({ error: "Failed to load users" });
    }
  });

  app.patch(
    "/admin/users/:userId",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service || !updateUser) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      try {
        const params = userParamsSchema.safeParse(request.params);
        const body = userUpdateSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.status(400).send({ error: "Invalid user update" });
        }

        const result = await updateUser({
          actorId: user.id,
          targetId: params.data.userId,
          values: body.data,
        });
        if (!result.allowed) {
          return reply.status(403).send({
            error:
              result.reason === "actor"
                ? "Super admin access required"
                : result.reason === "self"
                ? "Cannot modify yourself"
                : "Cannot modify super admins",
          });
        }
        return { user: toAdminUser(result.user as AdminUserRow) };
      } catch (error) {
        request.log.error({ err: error }, "Failed to update user");
        return reply.status(500).send({ error: "Failed to update user" });
      }
    },
  );
}
