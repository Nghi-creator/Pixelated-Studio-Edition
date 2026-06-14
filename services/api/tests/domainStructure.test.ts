import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogCacheKey,
  getPageRange as getCatalogPageRange,
  selectFeaturedGames,
} from "../src/modules/catalog/catalogService.js";
import {
  canResolveTargetRole,
  canReviewOwnReport,
  getPageRange as getModerationPageRange,
} from "../src/modules/moderation/moderationPolicy.js";

test("catalog helpers normalize cache keys and page ranges", () => {
  assert.equal(
    getCatalogCacheKey(2, 15, "Quest"),
    getCatalogCacheKey(2, 15, "quest"),
  );
  assert.deepEqual(getCatalogPageRange(2, 15), { end: 29, start: 15 });
});

test("featured selection preserves play-count ranking and limits results", () => {
  const games = Array.from({ length: 7 }, (_, index) => ({
    id: `game-${index}`,
    play_count: 7 - index,
  }));

  assert.deepEqual(
    selectFeaturedGames(games).map((game) => game.id),
    ["game-0", "game-1", "game-2", "game-3", "game-4"],
  );
});

test("moderation policy centralizes report and target privilege rules", () => {
  assert.equal(canReviewOwnReport("admin", "actor", "actor"), false);
  assert.equal(canReviewOwnReport("super_admin", "actor", "actor"), true);
  assert.equal(canResolveTargetRole("admin", "admin"), false);
  assert.equal(canResolveTargetRole("super_admin", "admin"), true);
  assert.deepEqual(getModerationPageRange(3, 25), { end: 74, start: 50 });
});
