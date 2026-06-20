import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminApiErrorMessage,
  getPageAfterRemoval,
  getPageRangeLabel,
} from "../../../src/features/admin/adminState.ts";

test("admin API errors prefer server-safe payload messages", () => {
  assert.equal(
    getAdminApiErrorMessage(
      { payload: { error: "Only super admins can manage users." } },
      "Fallback",
    ),
    "Only super admins can manage users.",
  );
  assert.equal(
    getAdminApiErrorMessage(new Error("network unavailable"), "Fallback"),
    "network unavailable",
  );
  assert.equal(getAdminApiErrorMessage(null, "Fallback"), "Fallback");
});

test("admin page removal clamps to the last available page", () => {
  assert.equal(
    getPageAfterRemoval({
      currentPage: 3,
      pageSize: 25,
      totalAfterRemoval: 50,
    }),
    2,
  );
  assert.equal(
    getPageAfterRemoval({
      currentPage: 1,
      pageSize: 25,
      totalAfterRemoval: 0,
    }),
    1,
  );
});

test("admin page labels describe the rendered server page", () => {
  assert.equal(
    getPageRangeLabel({
      currentCount: 10,
      page: 2,
      pageSize: 25,
      total: 35,
    }),
    "Showing 26-35 of 35",
  );
  assert.equal(
    getPageRangeLabel({
      currentCount: 0,
      page: 1,
      pageSize: 25,
      total: 0,
    }),
    "Showing 0-0 of 0",
  );
});
