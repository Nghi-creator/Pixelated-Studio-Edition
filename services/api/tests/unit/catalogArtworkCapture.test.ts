import assert from "node:assert/strict";
import test from "node:test";
import { parseCaptureCommand } from "../../src/modules/catalog/ingestion/catalogArtworkCapture.js";

test("capture command parser preserves quoted args without invoking a shell", () => {
  assert.deepEqual(
    parseCaptureCommand('node ./capture.js --name "Pixel Quest" --flag=value'),
    {
      args: ["./capture.js", "--name", "Pixel Quest", "--flag=value"],
      file: "node",
    },
  );
});

test("capture command parser rejects malformed command text", () => {
  assert.throws(
    () => parseCaptureCommand('node "./capture.js'),
    /unterminated quote/,
  );
  assert.throws(() => parseCaptureCommand("   "), /cannot be empty/);
});
