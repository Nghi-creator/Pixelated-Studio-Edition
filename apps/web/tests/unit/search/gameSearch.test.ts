import assert from "node:assert/strict";
import test from "node:test";
import {
  getGameSearchScore,
  searchAndRankGames,
} from "../../../src/features/search/gameSearch.ts";

test("game search ranks exact, prefix, token, initials, and typo matches", () => {
  const games = [
    { id: "contains", title: "Alpha Quest" },
    { id: "prefix", title: "Quest Drift" },
    { id: "typo", title: "Pixel Runner" },
    { id: "initials", title: "Super Pixel Quest" },
    { id: "unrelated", title: "Space Garden" },
  ];

  assert.deepEqual(
    searchAndRankGames(games, "quest").map((game) => game.id),
    ["prefix", "contains", "initials"],
  );
  assert.deepEqual(
    searchAndRankGames(games, "runer").map((game) => game.id),
    ["typo"],
  );
  assert.equal(getGameSearchScore({ title: "Super Pixel Quest" }, "spq"), 50);
  assert.equal(getGameSearchScore({ title: "Space Garden" }, "mario"), null);
});
