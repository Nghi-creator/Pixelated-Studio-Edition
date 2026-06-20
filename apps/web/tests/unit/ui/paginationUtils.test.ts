import assert from "node:assert/strict";
import test from "node:test";
import {
  getPageSlice,
  getVisiblePageNumbers,
} from "../../../src/components/ui/paginationUtils.ts";

test("pagination shows all small page sets and condenses larger sets", () => {
  assert.deepEqual(getVisiblePageNumbers(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(getVisiblePageNumbers(5, 10), [1, 4, 5, 6, 10]);
  assert.deepEqual(getVisiblePageNumbers(10, 10), [1, 9, 10]);
});

test("page slices clamp invalid pages and preserve paging metadata", () => {
  const items = Array.from({ length: 17 }, (_, index) => index + 1);

  assert.deepEqual(getPageSlice(items, 2, 5), {
    items: [6, 7, 8, 9, 10],
    pageStart: 5,
    safeCurrentPage: 2,
    totalPages: 4,
  });
  assert.deepEqual(getPageSlice(items, 99, 5), {
    items: [16, 17],
    pageStart: 15,
    safeCurrentPage: 4,
    totalPages: 4,
  });
});
