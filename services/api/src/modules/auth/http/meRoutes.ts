import type { FastifyInstance } from "fastify";
import {
  requireSupabaseUser,
  supabaseService,
} from "../supabaseAuth.js";

type ProfilePermissions = {
  avatar_url: string | null;
  email: string | null;
  is_banned: boolean;
  is_developer: boolean;
  role: string;
  username: string | null;
};

const DEFAULT_PROFILE: ProfilePermissions = {
  avatar_url: null,
  email: null,
  is_banned: false,
  is_developer: false,
  role: "user",
  username: null,
};

type SupabaseServiceLike = NonNullable<typeof supabaseService>;

type MeRouteOptions = {
  requireUser?: typeof requireSupabaseUser;
  supabase?: SupabaseServiceLike | null;
};

function buildAbilities(profile: ProfilePermissions) {
  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isSuperAdmin = profile.role === "super_admin";

  return {
    canAccessAdmin: isAdmin,
    canManageReports: isAdmin,
    canManageUsers: isSuperAdmin,
    canPublishGames: profile.is_developer || isAdmin,
    isBanned: profile.is_banned,
  };
}

async function getProfile(service: SupabaseServiceLike | null, userId: string) {
  if (!service) return DEFAULT_PROFILE;

  const { data, error } = await service
    .from("profiles")
    .select("username, email, avatar_url, role, is_banned, is_developer")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    ...DEFAULT_PROFILE,
    ...data,
  };
}

export async function registerMeRoutes(
  app: FastifyInstance,
  options: MeRouteOptions = {},
) {
  const requireUser = options.requireUser || requireSupabaseUser;
  const service = options.supabase === undefined ? supabaseService : options.supabase;

  app.get("/me", { preHandler: requireUser }, async (request) => {
    const user = request.user;

    return {
      user: {
        id: user?.id,
        email: user?.email ?? null,
      },
    };
  });

  app.get(
    "/me/permissions",
    { preHandler: requireUser },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: "Missing authenticated user" });
      }

      try {
        const profile = await getProfile(service, user.id);

        return {
          abilities: buildAbilities(profile),
          profile: {
            avatar_url: profile.avatar_url,
            email: profile.email,
            is_banned: profile.is_banned,
            is_developer: profile.is_developer,
            role: profile.role,
            username: profile.username,
          },
          user: {
            id: user.id,
            email: user.email ?? null,
          },
        };
      } catch (err) {
        request.log.error(err, "Failed to load user permissions");
        return reply.status(500).send({
          error: "Failed to load user permissions",
        });
      }
    },
  );
}
