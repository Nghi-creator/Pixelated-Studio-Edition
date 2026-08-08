import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../../config/env.js";
import {
  requireSupabaseUser,
  supabaseService,
} from "../../auth/http/supabaseAuth.js";
import { rejectRateLimitedRequest } from "../../security/rateLimitResponse.js";
import {
  createRateLimiter,
  type RateLimiter,
} from "../../security/sharedRateLimiter.js";
import {
  createDeleteAccount,
  DeleteAccountError,
} from "../application/deleteAccount.js";
import { isOwnedAvatarUrl as checkOwnedAvatarUrl } from "../domain/avatarPolicy.js";
import {
  findOwnedAccountStorage,
  removeOwnedAccountStorage,
} from "../infrastructure/supabaseAccountStorage.js";
import { deleteSupabaseIdentity } from "../infrastructure/supabaseIdentityAdmin.js";
import {
  findAccountRole,
  findProfile,
  findProfileActivity,
  updateProfile,
} from "../infrastructure/supabaseProfileRepository.js";

const profileUpdateSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  username: z.string().trim().min(1).max(80),
});
const deleteAccountSchema = z.object({ confirmation: z.literal("DELETE") });
const profileActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const ACCOUNT_DELETE_RATE_LIMIT = 3;
const ACCOUNT_DELETE_RATE_WINDOW_MS = 60 * 60 * 1000;

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type ProfileRouteOptions = {
  deleteLimiter?: RateLimiter;
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
  supabaseUrl?: string;
};

export function isOwnedAvatarUrl(
  value: string,
  userId: string,
  supabaseUrl = env.SUPABASE_URL,
) {
  return checkOwnedAvatarUrl(value, userId, supabaseUrl);
}

export async function registerProfileRoutes(
  app: FastifyInstance,
  options: ProfileRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;
  const supabaseUrl = options.supabaseUrl || env.SUPABASE_URL;
  const deleteLimiter =
    options.deleteLimiter ||
    createRateLimiter({
      limit: ACCOUNT_DELETE_RATE_LIMIT,
      namespace: "account-delete",
      windowMs: ACCOUNT_DELETE_RATE_WINDOW_MS,
    });
  const deleteAccount = service
    ? createDeleteAccount({
        deleteIdentity: (userId) => deleteSupabaseIdentity(service, userId),
        findOwnedStorage: (userId) => findOwnedAccountStorage(service, userId),
        findRole: (userId) => findAccountRole(service, userId),
        removeOwnedStorage: (storage) => removeOwnedAccountStorage(service, storage),
      })
    : null;

  app.get("/profile", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    try {
      return { profile: await findProfile(service, user.id) };
    } catch (error) {
      request.log.error({ err: error }, "Failed to load profile");
      return reply.status(500).send({ error: "Failed to load profile" });
    }
  });

  app.get(
    "/profile/activity",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!service) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      const query = profileActivityQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: "Invalid profile activity query" });
      }

      try {
        return {
          activity: await findProfileActivity(service, user.id, query.data.limit),
        };
      } catch (error) {
        request.log.error({ err: error }, "Failed to load profile activity");
        return reply.status(500).send({ error: "Failed to load profile activity" });
      }
    },
  );

  app.patch("/profile", { preHandler: requireUser }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
    if (!service) {
      return reply.status(503).send({
        error: "Supabase service client is not configured for the API.",
      });
    }

    const body = profileUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid profile update" });
    if (
      body.data.avatarUrl &&
      !isOwnedAvatarUrl(body.data.avatarUrl, user.id, supabaseUrl)
    ) {
      return reply.status(400).send({
        error: "Avatar must be an owned avatar storage object.",
      });
    }

    try {
      await updateProfile(service, user.id, body.data);
      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Failed to update profile");
      return reply.status(500).send({ error: "Failed to update profile" });
    }
  });

  app.delete(
    "/me/account",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: "Missing authenticated user" });
      if (!deleteAccount) {
        return reply.status(503).send({
          error: "Supabase service client is not configured for the API.",
        });
      }

      if (
        rejectRateLimitedRequest(
          reply,
          await deleteLimiter.consume(user.id),
          "Too many account deletion attempts. Try again later.",
        )
      ) return;

      const body = deleteAccountSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          error: "Type DELETE to confirm account deletion.",
        });
      }

      try {
        const result = await deleteAccount({
          lastSignInAt: user.last_sign_in_at,
          userId: user.id,
        });

        if (result.status === "admin_forbidden") {
          return reply.status(403).send({
            error: "Admin and super admin accounts cannot be self-deleted.",
          });
        }
        if (result.status === "recent_sign_in_required") {
          return reply.status(403).send({
            error: "Sign in again before deleting your account.",
            code: "recent_sign_in_required",
          });
        }
        if (result.status === "deleted_with_incomplete_cleanup") {
          request.log.error(
            { cleanupFailures: result.cleanupFailures },
            "Account deleted but storage cleanup is incomplete",
          );
          return reply.status(200).send({
            accountDeleted: true,
            cleanupIncomplete: true,
            code: "account_storage_cleanup_incomplete",
          });
        }

        request.log.info("User account deleted");
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof DeleteAccountError) {
          request.log.error({ err: error.cause }, "Account deletion failed");
          if (error.stage === "authorize") {
            return reply.status(500).send({ error: "Failed to verify account role" });
          }
          if (error.stage === "inspect_storage") {
            return reply.status(500).send({
              error: "Failed to inspect account files. Your account was not deleted.",
            });
          }
        }
        return reply.status(500).send({ error: "Failed to delete account" });
      }
    },
  );
}
