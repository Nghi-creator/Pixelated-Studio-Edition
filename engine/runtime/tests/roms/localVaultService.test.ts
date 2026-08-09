import assert from "node:assert/strict";
import test from "node:test";
import {
  mapWithConcurrency,
  VAULT_STAT_CONCURRENCY,
} from "../../src/roms/localVaultService";

test("Local Vault metadata work stays within its concurrency bound", async () => {
  const items = Array.from(
    { length: VAULT_STAT_CONCURRENCY * 4 },
    (_, index) => index,
  );
  let active = 0;
  let maxActive = 0;

  const results = await mapWithConcurrency(
    items,
    VAULT_STAT_CONCURRENCY,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      return item * 2;
    },
  );

  assert.equal(maxActive, VAULT_STAT_CONCURRENCY);
  assert.deepEqual(results, items.map((item) => item * 2));
});

test("bounded metadata work rejects invalid concurrency", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 0, async (item) => item),
    /positive integer/,
  );
});
