import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
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

export function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header) return null;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;

  const [scheme, token] = parts;
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export async function requireSupabaseUser(
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

  request.user = data.user;
}

export async function attachOptionalSupabaseUser(
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
    return undefined;
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);

  if (error || !data.user) {
    return reply.status(401).send({ error: "Invalid bearer token" });
  }

  request.user = data.user;
  return undefined;
}
