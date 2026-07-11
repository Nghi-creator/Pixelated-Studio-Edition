import assert from "node:assert/strict";
import test from "node:test";
import { TtlCache } from "../../src/modules/cache/ttlCache.js";

test("TTL cache bounds unique keys by evicting the oldest entry", () => {
  const cache = new TtlCache<number>(60_000, 2);

  cache.set("oldest", 1);
  cache.set("newer", 2);
  cache.set("newest", 3);

  assert.equal(cache.get("oldest"), null);
  assert.equal(cache.get("newer"), 2);
  assert.equal(cache.get("newest"), 3);
});

test("TTL cache rejects invalid resource bounds", () => {
  assert.throws(() => new TtlCache(0), /TTL/);
  assert.throws(() => new TtlCache(1_000, 0), /max entries/);
});
