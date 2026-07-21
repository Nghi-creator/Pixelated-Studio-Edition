import assert from "node:assert/strict";
import test from "node:test";
import { TtlCache } from "../../../src/modules/cache/ttlCache.js";
import {
  CATALOG_CACHE_MAX_ENTRIES,
  createCatalogRouteContext,
} from "../../../src/modules/catalog/http/catalogRouteContext.js";

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

test("catalog cache uses a conservative cardinality bound", () => {
  const context = createCatalogRouteContext({ supabase: null });
  const response = {
    games: [],
    page: 1,
    pageSize: 15,
    total: 0,
    totalPages: 1,
  };

  for (let index = 0; index <= CATALOG_CACHE_MAX_ENTRIES; index += 1) {
    context.gamesCatalogCache.set(`query-${index}`, response);
  }

  assert.equal(CATALOG_CACHE_MAX_ENTRIES, 256);
  assert.equal(context.gamesCatalogCache.get("query-0"), null);
  assert.deepEqual(
    context.gamesCatalogCache.get(`query-${CATALOG_CACHE_MAX_ENTRIES}`),
    response,
  );
});
