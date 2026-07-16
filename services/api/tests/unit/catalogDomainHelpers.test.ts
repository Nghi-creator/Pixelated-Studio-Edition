import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCatalogObjectSegment } from "../../src/modules/catalog/domain/catalogObjectPath.js";
import {
  getSubmissionRomPlatform,
  getSupportedSubmissionRomExtension,
  SUPPORTED_SUBMISSION_ROM_EXTENSIONS,
} from "../../src/modules/catalog/domain/submissionRom.js";

test("catalog object paths use one bounded segment sanitizer", () => {
  assert.equal(
    sanitizeCatalogObjectSegment(" ../Tiny Quest (USA).nes ", "artifact"),
    "..-Tiny-Quest-USA-.nes",
  );
  assert.equal(sanitizeCatalogObjectSegment("***", "artwork"), "artwork");
  assert.equal(
    sanitizeCatalogObjectSegment("x".repeat(200), "artifact").length,
    120,
  );
});

test("submission ROM extension and platform lookup share one catalog contract", () => {
  assert.equal(getSupportedSubmissionRomExtension("TINY.GBA"), ".gba");
  assert.deepEqual(getSubmissionRomPlatform("tiny.smc"), {
    platformId: "snes",
    runtimeId: "bsnes",
  });
  assert.equal(getSubmissionRomPlatform("tiny.zip"), null);
  assert.equal(new Set(SUPPORTED_SUBMISSION_ROM_EXTENSIONS).size, 10);
});
