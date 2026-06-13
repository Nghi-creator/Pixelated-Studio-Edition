import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHttpErrorResponse } from "./errorHandlers";

describe("engine HTTP error responses", () => {
  it("reports rejected origins as forbidden rather than server failures", () => {
    assert.deepEqual(
      getHttpErrorResponse({ statusCode: 403 }),
      { body: { error: "Origin not allowed" }, status: 403 },
    );
  });

  it("keeps unexpected errors generic", () => {
    assert.deepEqual(
      getHttpErrorResponse(new Error("secret detail")),
      { body: { error: "Internal engine error" }, status: 500 },
    );
  });
});
