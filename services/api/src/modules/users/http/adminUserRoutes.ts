import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import {
  clearCachedUserRole,
  getCachedUserRole,
} from "../../auth/roleCache.js";
import { logTiming, timed } from "../../observability/timing.js";

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

type ProfileRole = {
  role: string | null;
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type AdminUserRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function isSuperAdminRole(role: string | null | undefined) {
  return role === "super_admin";
}

async function requireSuperAdmin(
  service: SupabaseServiceLike | null,
  userId: string,
) {
  if (!service) return false;

  const { error, role } = await getCachedUserRole(service, userId);

  if (error) throw error;
  return isSuperAdminRole(role);
}

export async function registerAdminUserRoutes(
  app: FastifyInstance,
  options: AdminUserRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.get(
    "/admin/users",
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
      const roleLookup = await timed(timings, "admin_role_check_ms", () =>
        getCachedUserRole(service, user.id),
      );

      if (roleLookup.error) {
        request.log.error({ err: roleLookup.error }, "Failed to load admin role");
        return reply.status(500).send({ error: "Failed to authorize users" });
      }

      if (!isSuperAdminRole(roleLookup.role)) {
        return reply.status(403).send({ error: "Super admin access required" });
      }

      const parsedQuery = usersQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({ error: "Invalid users query" });
      }

      const { page, pageSize, search } = parsedQuery.data;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let usersQuery = service
        .from("profiles")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (search) {
        usersQuery = usersQuery.ilike("username", `%${search}%`);
      }

      const { data, count, error } = await timed(
        timings,
        "admin_users_query_ms",
        () => usersQuery.range(start, end),
      );

      if (error) {
        request.log.error({ err: error }, "Failed to load users");
        return reply.status(500).send({ error: "Failed to load users" });
      }

      const total = count || 0;
      logTiming(request.log, "Admin users timing", timings, {
        page,
        pageSize,
        resultCount: data?.length || 0,
        roleCache: roleLookup.cache,
        search: Boolean(search),
        total,
      });

      return {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        users: data || [],
      };
    },
  );

  app.patch(
    "/admin/users/:userId",
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

      if (!(await requireSuperAdmin(service, user.id))) {
        return reply.status(403).send({ error: "Super admin access required" });
      }

      const params = userParamsSchema.safeParse(request.params);
      const body = userUpdateSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ error: "Invalid user update" });
      }

      if (params.data.userId === user.id) {
        return reply.status(403).send({ error: "Cannot modify yourself" });
      }

      const { data: target, error: targetError } = await service
        .from("profiles")
        .select("role")
        .eq("id", params.data.userId)
        .maybeSingle<ProfileRole>();
      if (targetError) {
        request.log.error({ err: targetError }, "Failed to load target user role");
        return reply.status(500).send({ error: "Failed to authorize user update" });
      }
      if (target?.role === "super_admin") {
        return reply.status(403).send({ error: "Cannot modify super admins" });
      }

      const { data, error } = await service
        .from("profiles")
        .update(body.data)
        .eq("id", params.data.userId)
        .select()
        .single();

      if (error || !data) {
        request.log.error({ err: error }, "Failed to update user");
        return reply.status(500).send({ error: "Failed to update user" });
      }

      clearCachedUserRole(params.data.userId);
      clearCachedUserRole(user.id);
      return { user: data };
    },
  );
}
