import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import { env } from "../../config/env.js";

export function createSupabaseAnonClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
  });
}

export function createSupabaseServiceClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });
}

export const supabaseAnon = createSupabaseAnonClient();
export const supabaseService = createSupabaseServiceClient();

type BanLookupService = {
  from(table: "profiles"): {
    select(columns: "is_banned"): {
      eq(column: "id", userId: string): {
        maybeSingle<T>(): PromiseLike<{
          data: T | null;
          error: unknown;
        }>;
      };
    };
  };
};

export async function getAuthoritativeUserBanStatus(
  service: BanLookupService,
  userId: string,
) {
  const { data, error } = await service
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle<{ is_banned: boolean | null }>();

  if (error) throw error;
  return data?.is_banned === true;
}

export function isAnonymousSupabaseUser(user: User | null | undefined) {
  return user?.is_anonymous === true;
}

export function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header) return null;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const [scheme, token] = parts;
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

async function rejectUnauthorizedAccount(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
) {
  if (!supabaseService) {
    reply.status(503).send({
      error: "Account authorization is not configured for the API service.",
    });
    return true;
  }

  try {
    if (
      await getAuthoritativeUserBanStatus(
        supabaseService as unknown as BanLookupService,
        userId,
      )
    ) {
      reply.status(403).send({
        code: "account_banned",
        error: "This account has been suspended.",
      });
      return true;
    }
  } catch (banLookupError) {
    request.log.error(
      { err: banLookupError, userId },
      "Failed to enforce account ban status",
    );
    reply.status(503).send({
      error: "Account authorization is temporarily unavailable.",
    });
    return true;
  }

  return false;
}

export async function requireSupabaseIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!supabaseAnon) {
    return reply.status(503).send({
      error: "Supabase auth is not configured for the API service.",
    });
  }

  const token = getBearerToken(request);
  if (!token) {
    return reply.status(401).send({ error: "Missing bearer token" });
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);

  if (error || !data.user) {
    return reply.status(401).send({ error: "Invalid bearer token" });
  }

  if (await rejectUnauthorizedAccount(request, reply, data.user.id)) return;

  request.user = data.user;
}

export async function requireSupabaseUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  await requireSupabaseIdentity(request, reply);
  if (reply.sent || !request.user) return;

  if (isAnonymousSupabaseUser(request.user)) {
    return reply.status(403).send({
      error: "A permanent account is required for this action.",
    });
  }
}

export async function attachOptionalSupabaseUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = getBearerToken(request);
  if (!token) {
    return undefined;
  }

  if (!supabaseAnon) {
    return reply.status(503).send({
      error: "Supabase auth is not configured for the API service.",
    });
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);

  if (error || !data.user) {
    return reply.status(401).send({ error: "Invalid bearer token" });
  }

  if (await rejectUnauthorizedAccount(request, reply, data.user.id)) return;

  request.user = data.user;
  return undefined;
}
