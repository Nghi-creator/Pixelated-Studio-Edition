import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  getBearerToken,
  getAuthoritativeUserBanStatus,
  isAnonymousSupabaseUser,
} from "../../../src/modules/auth/http/supabaseAuth.js";

function requestWithAuthorization(authorization?: string) {
  return {
    headers: {
      authorization,
    },
  } as FastifyRequest;
}

test("bearer token parsing rejects malformed authorization headers", () => {
  assert.equal(getBearerToken(requestWithAuthorization("Bearer token")), "token");
  assert.equal(getBearerToken(requestWithAuthorization("bearer token")), "token");
  assert.equal(getBearerToken(requestWithAuthorization("Bearer token extra")), null);
  assert.equal(getBearerToken(requestWithAuthorization("Basic token")), null);
  assert.equal(getBearerToken(requestWithAuthorization("Bearer")), null);
  assert.equal(getBearerToken(requestWithAuthorization()), null);
});

test("anonymous Supabase identities are distinguished from permanent users", () => {
  assert.equal(isAnonymousSupabaseUser({ is_anonymous: true } as never), true);
  assert.equal(isAnonymousSupabaseUser({ is_anonymous: false } as never), false);
  assert.equal(isAnonymousSupabaseUser(undefined), false);
});

test("account bans are read from authoritative profile state", async () => {
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { is_banned: true },
            error: null,
          }),
        }),
      }),
    }),
  };

  assert.equal(
    await getAuthoritativeUserBanStatus(service, "user-1"),
    true,
  );
});

test("account ban enforcement fails closed when profile lookup fails", async () => {
  const lookupError = new Error("database unavailable");
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: lookupError }),
        }),
      }),
    }),
  };

  await assert.rejects(
    getAuthoritativeUserBanStatus(service, "user-1"),
    lookupError,
  );
});
