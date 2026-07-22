import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createCatalogRouteContext } from "../../src/modules/catalog/http/catalogRouteContext.js";
import {
  registerGamesCatalogRoutes,
  warmGamesCatalogCache,
} from "../../src/modules/catalog/http/gamesRoutes.js";
import {
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  seedPublishedGames,
  USER_ID,
} from "./dataBoundarySupport.js";

test("catalog and favorites are served through backend routes", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, { id: GAME_ID, title: "Zeta" });
  db.rows.favorites.push({
    game_id: GAME_ID,
    games: { id: GAME_ID, title: "Zeta" },
    user_id: USER_ID,
  });
  const app = await createDataBoundaryApp(db);

  const gamesResponse = await app.inject({ method: "GET", url: "/games" });
  assert.equal(gamesResponse.statusCode, 200);
  assert.equal(gamesResponse.json<{ games: unknown[] }>().games.length, 1);
  assert.equal(
    db.rpcCalls.some((call) => call.fn === "published_catalog_games"),
    true,
  );

  const favoriteResponse = await app.inject({
    method: "GET",
    url: `/favorites/${GAME_ID}`,
  });
  assert.equal(favoriteResponse.statusCode, 200);
  assert.equal(favoriteResponse.json<{ favorited: boolean }>().favorited, true);

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/favorites/${GAME_ID}`,
  });
  assert.equal(deleteResponse.statusCode, 204);
  assert.equal(db.rows.favorites.length, 0);
  await app.close();
});

test("catalog hides games without an enabled build and verified rights", async () => {
  const db = new FakeSupabase();
  db.rows.games.push({
    id: "unreviewed-game",
    publication_status: "published",
    title: "Unreviewed",
  });
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({ method: "GET", url: "/games" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json<{ games: unknown[] }>().games, []);
  await app.close();
});

test("catalog route paginates, searches, and returns featured games", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { cover_url: "/a.png", id: "game-a", play_count: 2, title: "Alpha Quest" },
    { cover_url: "/b.png", id: "game-b", play_count: 20, title: "Beta Quest" },
    { cover_url: "/c.png", id: "game-c", play_count: 5, title: "Gamma Run" },
    { cover_url: "/d.png", id: "game-d", play_count: 7, title: "Quest Drift" },
    { cover_url: "/e.png", id: "game-e", play_count: 3, title: "Delta Run" },
    { cover_url: "/f.png", id: "game-f", play_count: 1, title: "Echo Run" },
  );
  const app = await createDataBoundaryApp(db);

  const unsearchedResponse = await app.inject({
    method: "GET",
    url: "/games?page=2&pageSize=2",
  });

  assert.equal(unsearchedResponse.statusCode, 200);
  assert.deepEqual(
    unsearchedResponse
      .json<{ games: { id: string }[] }>()
      .games.map((game) => game.id),
    ["game-e", "game-f"],
  );

  const response = await app.inject({
    method: "GET",
    url: "/games?page=2&pageSize=2&search=quest",
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    featuredGames: { id: string }[];
    games: { id: string }[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>();
  assert.deepEqual(
    body.games.map((game) => game.id),
    ["game-a"],
  );
  assert.deepEqual(
    body.featuredGames.map((game) => game.id),
    ["game-b", "game-d", "game-c", "game-e", "game-a"],
  );
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 2);
  assert.equal(body.total, 3);
  assert.equal(body.totalPages, 2);
  await app.close();
});

test("catalog route rejects amplification-oriented query shapes", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(db, { id: GAME_ID, title: "Bounded" });
  const app = await createDataBoundaryApp(db);

  const oversizedPage = await app.inject({
    method: "GET",
    url: "/games?page=501",
  });
  assert.equal(oversizedPage.statusCode, 400);

  const excessiveTerms = await app.inject({
    method: "GET",
    url: `/games?search=${encodeURIComponent("one two three four five six seven eight nine ten eleven twelve thirteen")}`,
  });
  assert.equal(excessiveTerms.statusCode, 400);
  assert.equal(
    db.rpcCalls.filter((call) => call.fn === "published_catalog_games").length,
    0,
  );
  await app.close();
});

test("catalog search is pushed into the published catalog RPC", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    ...Array.from({ length: 1005 }, (_, index) => ({
      id: `filler-${index.toString().padStart(4, "0")}`,
      title: `Filler ${index.toString().padStart(4, "0")}`,
    })),
    { id: "omega-hidden", title: "Omega Hidden Quest" },
  );
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games?search=omega&pageSize=5",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["omega-hidden"],
  );
  assert.equal(
    db.rpcCalls.some(
      (call) =>
        call.fn === "published_catalog_games" && call.params.p_search === "omega",
    ),
    true,
  );
  await app.close();
});

test("catalog exposes eligible facets and filters genre and SPDX license server-side", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { genre_slug: "puzzle", id: "puzzle-mit", title: "Puzzle MIT" },
    { genre_slug: "action", id: "action-gpl", title: "Action GPL" },
  );
  const gplRights = db.rows.game_rights.find(
    (rights) => rights.game_id === "action-gpl",
  );
  assert.ok(gplRights);
  gplRights.code_license_spdx = "GPL-3.0-only";

  const app = await createDataBoundaryApp(db);
  const facetsResponse = await app.inject({ method: "GET", url: "/games/filters" });
  assert.equal(facetsResponse.statusCode, 200);
  assert.deepEqual(facetsResponse.json(), {
    genres: ["action", "puzzle"],
    licenses: ["GPL-3.0-only", "MIT"],
  });

  const filteredResponse = await app.inject({
    method: "GET",
    url: "/games?genre=action&license=GPL-3.0-only",
  });
  assert.equal(filteredResponse.statusCode, 200);
  assert.deepEqual(
    filteredResponse.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["action-gpl"],
  );
  assert.equal(
    db.rpcCalls.some(
      (call) =>
        call.fn === "published_catalog_games" &&
        call.params.p_genre === "action" &&
        call.params.p_license_spdx === "GPL-3.0-only",
    ),
    true,
  );
  await app.close();
});

test("catalog filters games by playable build platform", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { id: "nes-game", title: "NES Game" },
    { id: "gb-game", title: "Game Boy Game" },
  );
  const gameBoyBuild = db.rows.game_builds.find(
    (build) => build.game_id === "gb-game",
  );
  assert.ok(gameBoyBuild);
  gameBoyBuild.platform_id = "gb";

  const app = await createDataBoundaryApp(db);
  const response = await app.inject({
    method: "GET",
    url: "/games?platform=gb",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json<{ games: { id: string }[] }>().games.map((game) => game.id),
    ["gb-game"],
  );
  await app.close();
});

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

test("catalog cache keeps featured games fresh", async () => {
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
  assert.deepEqual(
    secondResponse
      .json<{ featuredGames: { id: string }[] }>()
      .featuredGames.map((game) => game.id),
    ["cache-featured-b", "cache-featured-a"],
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
