import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureFavoritesLoaded,
  getFavoriteSnapshot,
  mutateFavorite,
  replaceFavoriteIds,
  resetFavoriteState,
} from "../../../src/features/favorites/favoriteState.ts";

test("favorite state coordinates one load and synchronizes mutations", async () => {
  resetFavoriteState();
  let loads = 0;
  const load = async () => {
    loads += 1;
    return new Set(["game-1"]);
  };

  await Promise.all([ensureFavoritesLoaded(load), ensureFavoritesLoaded(load)]);
  assert.equal(loads, 1);
  assert.deepEqual([...getFavoriteSnapshot().ids], ["game-1"]);

  let mutations = 0;
  await Promise.all([
    mutateFavorite("game-2", true, async () => {
      mutations += 1;
    }),
    mutateFavorite("game-2", true, async () => {
      mutations += 1;
    }),
  ]);

  assert.equal(mutations, 1);
  assert.deepEqual([...getFavoriteSnapshot().ids], ["game-1", "game-2"]);
});

test("favorite state can be replaced by an authoritative library response", () => {
  resetFavoriteState();
  replaceFavoriteIds(new Set(["game-3"]));

  assert.equal(getFavoriteSnapshot().loaded, true);
  assert.deepEqual([...getFavoriteSnapshot().ids], ["game-3"]);
});

test("failed favorite mutations preserve prior state and release their lock", async () => {
  resetFavoriteState();
  replaceFavoriteIds(new Set(["game-1"]));

  await assert.rejects(
    mutateFavorite("game-1", false, async () => {
      throw new Error("storage unavailable");
    }),
    /storage unavailable/,
  );

  assert.deepEqual([...getFavoriteSnapshot().ids], ["game-1"]);
  assert.equal(getFavoriteSnapshot().pendingIds.has("game-1"), false);
});

test("newer favorite mutations win over an older in-flight load", async () => {
  resetFavoriteState();
  let finishLoad: ((ids: Set<string>) => void) | undefined;
  const loading = ensureFavoritesLoaded(
    () =>
      new Promise<Set<string>>((resolve) => {
        finishLoad = resolve;
      }),
  );

  await mutateFavorite("game-new", true, async () => undefined);
  finishLoad?.(new Set(["game-existing"]));
  await loading;

  assert.deepEqual(
    [...getFavoriteSnapshot().ids].sort(),
    ["game-existing", "game-new"],
  );
});
