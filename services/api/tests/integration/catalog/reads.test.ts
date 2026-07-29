import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  GAME_ID,
  seedPublishedGames,
  USER_ID,
} from "../support/dataBoundarySupport.js";

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
    db.rpcCalls.some((call) => call.fn === "published_catalog_games_page"),
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
    db.rpcCalls.filter((call) => call.fn === "published_catalog_games_page").length,
    0,
  );
  await app.close();
});

test("catalog preserves totals when a requested page is beyond the final row", async () => {
  const db = new FakeSupabase();
  seedPublishedGames(
    db,
    { id: "page-total-a", title: "Alpha" },
    { id: "page-total-b", title: "Beta" },
  );
  const app = await createDataBoundaryApp(db);

  const response = await app.inject({
    method: "GET",
    url: "/games?page=10&pageSize=2",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json<{ games: unknown[] }>().games, []);
  assert.equal(response.json<{ total: number }>().total, 2);
  assert.equal(response.json<{ totalPages: number }>().totalPages, 1);
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
        call.fn === "published_catalog_games_page" &&
        call.params.p_search === "omega" &&
        call.params.p_page_size === 5,
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
        call.fn === "published_catalog_games_page" &&
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
  assert.equal(
    db.rpcCalls.some(
      (call) =>
        call.fn === "published_catalog_games_page" &&
        call.params.p_platform === "gb",
    ),
    true,
  );
  await app.close();
});
