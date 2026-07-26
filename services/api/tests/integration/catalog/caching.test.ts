import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createCatalogRouteContext } from "../../../src/modules/catalog/http/catalogRouteContext.js";
import {
  registerGamesCatalogRoutes,
  warmGamesCatalogCache,
} from "../../../src/modules/catalog/http/gamesRoutes.js";
import {
  createDataBoundaryApp,
  FakeSupabase,
  seedPublishedGames,
} from "../support/dataBoundarySupport.js";

test("catalog route caches public game pages briefly", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    id: "cache-game-a",
    play_count: 1,
    title: "Cache Alpha",
  });
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-alpha-unique",
  });
  seedPublishedGames(db, {
    id: "cache-game-b",
    play_count: 20,
    title: "Cache Alpha Unique",
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-alpha-unique",
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.headers["x-pixelated-cache"], "MISS");
  assert.equal(secondResponse.headers["x-pixelated-cache"], "HIT");
  assert.equal(firstResponse.json<{ total: number }>().total, 0);
  assert.equal(secondResponse.json<{ total: number }>().total, 0);
  await app.close();
});

test("catalog startup warmup covers the default home request and featured games", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    {
      cover_url: "/featured.png",
      id: "warm-featured",
      play_count: 10,
      title: "Warm Featured",
    },
    {
      cover_url: "/alpha.png",
      id: "warm-alpha",
      play_count: 1,
      title: "Warm Alpha",
    },
  );
  const app = Fastify({ logger: false });
  const context = createCatalogRouteContext({ supabase: db as never });
  registerGamesCatalogRoutes(app, context);

  await warmGamesCatalogCache(context);
  const warmupRpcCallCount = db.rpcCalls.length;

  const response = await app.inject({
    method: "GET",
    url: "/games",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-pixelated-cache"], "HIT");
  assert.equal(db.rpcCalls.length, warmupRpcCallCount);
  assert.deepEqual(
    response.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["warm-alpha", "warm-featured"],
  );
  assert.deepEqual(
    response
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["warm-featured", "warm-alpha"],
  );
  await app.close();
});

test("catalog cache reuses featured games without another database query", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    cover_url: "/a.png",
    id: "cache-featured-a",
    play_count: 1,
    title: "Cache Featured Alpha",
  });
  const app = await createDataBoundaryApp(db);

  const firstResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-featured-alpha",
  });
  const cachedRpcCallCount = db.rpcCalls.length;
  seedPublishedGames(db, {
    cover_url: "/b.png",
    id: "cache-featured-b",
    play_count: 20,
    title: "Cache Featured Beta",
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: "/games?page=1&pageSize=15&search=cache-featured-alpha",
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.headers["x-pixelated-cache"], "HIT");
  assert.equal(db.rpcCalls.length, cachedRpcCallCount);
  assert.deepEqual(
    secondResponse
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["cache-featured-a"],
  );
  await app.close();
});

test("featured games route bypasses shared catalog cache headers", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, {
    id: "featured-a",
    play_count: 1,
    title: "Featured A",
  });
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games/featured",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(
    response
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["featured-a"],
  );
  await app.close();
});

test("featured games route returns a wider pool while all play counts are zero", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { id: "zero-featured-a", play_count: 0, title: "Zero Featured A" },
    { id: "zero-featured-b", play_count: 0, title: "Zero Featured B" },
    { id: "zero-featured-c", play_count: 0, title: "Zero Featured C" },
    { id: "zero-featured-d", play_count: 0, title: "Zero Featured D" },
    { id: "zero-featured-e", play_count: 0, title: "Zero Featured E" },
    { id: "zero-featured-f", play_count: 0, title: "Zero Featured F" },
  );
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games/featured",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json<{ featuredGames: { id: string }[] }>().featuredGames.length,
    5,
  );
  await app.close();
});
