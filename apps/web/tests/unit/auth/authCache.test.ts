import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheValueForCurrentEntry,
  clearAuthScopedCache,
  type AsyncCacheEntry,
} from "../../../src/lib/auth/authCache.ts";

test("auth state changes clear every user-scoped cache", () => {
  const state = {
    favorites: new Set(["game-1"]),
    permissions: { canPublish: true },
    session: Promise.resolve({ userId: "user-1" }),
  };

  clearAuthScopedCache(state);

  assert.deepEqual(state, {
    favorites: null,
    permissions: null,
    session: null,
  });
});

test("a stale request cannot populate a newer auth cache entry", () => {
  const staleEntry: AsyncCacheEntry<string> = {
    expiresAt: 1,
    promise: Promise.resolve("old-user"),
  };
  const currentEntry: AsyncCacheEntry<string> = {
    expiresAt: 2,
    promise: Promise.resolve("new-user"),
  };

  assert.equal(
    cacheValueForCurrentEntry(currentEntry, staleEntry, "old-user"),
    "old-user",
  );
  assert.equal(staleEntry.value, undefined);
  assert.equal(currentEntry.value, undefined);

  cacheValueForCurrentEntry(currentEntry, currentEntry, "new-user");
  assert.equal(currentEntry.value, "new-user");
});
