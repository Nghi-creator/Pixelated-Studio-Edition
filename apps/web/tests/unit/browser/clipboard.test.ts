import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard } from "../../../src/lib/clipboard.ts";

test("clipboard helper uses the modern Clipboard API when available", async () => {
  let copiedText = "";
  const copied = await copyTextToClipboard("invite", {
    clipboard: {
      writeText: async (text) => {
        copiedText = text;
      },
    },
  });

  assert.equal(copied, true);
  assert.equal(copiedText, "invite");
});

test("clipboard helper reports failure without an available browser mechanism", async () => {
  const copied = await copyTextToClipboard("invite", {
    clipboard: undefined,
    documentRef: undefined,
  });

  assert.equal(copied, false);
});
