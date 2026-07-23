import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import {
  getBearerToken,
  isAnonymousSupabaseUser,
} from "../../../src/modules/auth/supabaseAuth.js";

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
