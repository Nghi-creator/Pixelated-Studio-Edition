import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/supabaseAuth.js";
import { clearCachedUserRole } from "../../auth/roleCache.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  createRateLimiter,
  type RateLimiter,
} from "../../security/sharedRateLimiter.js";

const profileUpdateSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  username: z.string().trim().min(1).max(80),
});

const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
});

const ACCOUNT_DELETE_RECENT_SIGN_IN_MS = 10 * 60 * 1000;
const ACCOUNT_DELETE_RATE_LIMIT = 3;
const ACCOUNT_DELETE_RATE_WINDOW_MS = 60 * 60 * 1000;
const STORAGE_LIST_PAGE_SIZE = 100;

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type ProfileRouteOptions = {
  deleteLimiter?: RateLimiter;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function hasRecentSignIn(lastSignInAt: string | undefined, now = Date.now()) {
  if (!lastSignInAt) return false;

  const signedInAt = Date.parse(lastSignInAt);
  return Number.isFinite(signedInAt) && now - signedInAt <= ACCOUNT_DELETE_RECENT_SIGN_IN_MS;
}

async function listStorageObjects(
  service: SupabaseServiceLike,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const storage = service.storage.from(bucket);
  const objectPaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await storage.list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;

    const entries = data || [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        objectPaths.push(path);
      } else {
        objectPaths.push(...(await listStorageObjects(service, bucket, path)));
      }
    }

    if (entries.length < STORAGE_LIST_PAGE_SIZE) return objectPaths;
    offset += STORAGE_LIST_PAGE_SIZE;
  }
}

async function removeOwnedStorage(
  service: SupabaseServiceLike,
  bucket: string,
  userId: string,
) {
  const storage = service.storage.from(bucket);
  const objectPaths = await listStorageObjects(service, bucket, userId);

  for (let index = 0; index < objectPaths.length; index += STORAGE_LIST_PAGE_SIZE) {
    const { error } = await storage.remove(
      objectPaths.slice(index, index + STORAGE_LIST_PAGE_SIZE),
    );
    if (error) throw error;
  }
}

export async function registerProfileRoutes(
  app: FastifyInstance,
  options: ProfileRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const deleteLimiter =
    options.deleteLimiter ||
    createRateLimiter({
      limit: ACCOUNT_DELETE_RATE_LIMIT,
      namespace: "account-delete",
      windowMs: ACCOUNT_DELETE_RATE_WINDOW_MS,
    });

  app.get(
    "/profile",
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

      const { data, error } = await service
        .from("profiles")
        .select("username, avatar_url, role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "Failed to load profile");
        return reply.status(500).send({ error: "Failed to load profile" });
      }

      return { profile: data || null };
    },
  );

  app.patch(
    "/profile",
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

      const body = profileUpdateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid profile update" });
      }

      const { error } = await service
        .from("profiles")
        .update({
          avatar_url: body.data.avatarUrl || null,
          username: body.data.username,
        })
        .eq("id", user.id);

      if (error) {
        request.log.error({ err: error }, "Failed to update profile");
        return reply.status(500).send({ error: "Failed to update profile" });
      }

      return { success: true };
    },
  );

  app.delete(
    "/me/account",
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

      const rateLimit = await deleteLimiter.consume(user.id);
      if (
        rejectRateLimitedRequest(
          reply,
          rateLimit,
          "Too many account deletion attempts. Try again later.",
        )
      ) {
        return;
      }

      const body = deleteAccountSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "Type DELETE to confirm account deletion.",
        });
      }

      const { data: profile, error: profileError } = await service
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();
      if (profileError) {
        request.log.error({ err: profileError }, "Failed to verify deletion role");
        return reply.status(500).send({ error: "Failed to verify account role" });
      }
      if (profile?.role === "admin" || profile?.role === "super_admin") {
        return reply.status(403).send({
          error: "Admin and super admin accounts cannot be self-deleted.",
        });
      }

      if (!hasRecentSignIn(user.last_sign_in_at)) {
        return reply.status(403).send({
          error: "Sign in again before deleting your account.",
          code: "recent_sign_in_required",
        });
      }

      try {
        await removeOwnedStorage(service, "avatars", user.id);
        await removeOwnedStorage(service, "submissions", user.id);
      } catch (error) {
        request.log.error({ err: error }, "Failed to clean account storage");
        return reply.status(500).send({
          error: "Failed to clean account files. Your account was not deleted.",
        });
      }

      const { error } = await service.auth.admin.deleteUser(user.id);
      if (error) {
        request.log.error({ err: error }, "Failed to delete account");
        return reply.status(500).send({ error: "Failed to delete account" });
      }

      clearCachedUserRole(user.id);
      request.log.info("User account deleted");
      return reply.status(204).send();
    },
  );
}
