import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateAdminReportsQueries,
  invalidateAdminUsersQueries,
  invalidateFavoriteQueries,
  invalidateGameCommentsQuery,
  invalidateGameReactionsQuery,
  invalidateProfileQueries,
  queryKeys,
} from "../../../src/lib/api/queryClient.ts";

test("query keys are stable and scoped by API concern", () => {
  assert.deepEqual(queryKeys.authSession(), ["authSession"]);
  assert.deepEqual(queryKeys.permissions(), ["permissions"]);
  assert.deepEqual(queryKeys.profile(), ["profile"]);
  assert.deepEqual(queryKeys.gameCatalog(2, 15, "mario"), [
    "gameCatalog",
    2,
    15,
    "mario",
  ]);
  assert.deepEqual(queryKeys.adminUsers(1, 25, "sam"), [
    "adminUsers",
    1,
    25,
    "sam",
  ]);
  assert.deepEqual(queryKeys.adminUsersRoot(), ["adminUsers"]);
  assert.deepEqual(queryKeys.adminReportsRoot(), ["adminReports"]);
  assert.deepEqual(queryKeys.localMultiplayerGames(), ["localMultiplayerGames"]);
});

test("shared invalidation helpers target exact and root query scopes", async () => {
  const client = new QueryClient();
  const invalidated: unknown[] = [];
  client.invalidateQueries = ((filters: { queryKey?: unknown }) => {
    invalidated.push(filters.queryKey);
    return Promise.resolve();
  }) as QueryClient["invalidateQueries"];

  await invalidateFavoriteQueries(client);
  await invalidateProfileQueries(client);
  await invalidateAdminUsersQueries(client);
  await invalidateAdminReportsQueries(client);
  await invalidateGameCommentsQuery(client, "game-1");
  await invalidateGameReactionsQuery(client, "game-1");

  assert.deepEqual(invalidated, [
    queryKeys.favoriteIds(),
    queryKeys.favorites(),
    queryKeys.profile(),
    queryKeys.permissions(),
    queryKeys.adminUsersRoot(),
    queryKeys.adminReportsRoot(),
    queryKeys.gameComments("game-1"),
    queryKeys.gameReactions("game-1"),
  ]);
});
