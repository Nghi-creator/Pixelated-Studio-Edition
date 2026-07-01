import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedOrigins, corsOptions, normalizeOrigin } from "../../src/config.js";

function checkOrigin(origin: string) {
  return new Promise<boolean>((resolve, reject) => {
    corsOptions.origin(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(allowed));
    });
  });
}

describe("engine origin allowlist", () => {
  it("includes hosted and local development origins by default", () => {
    assert.ok(
      allowedOrigins.includes("https://pixelated-studio-edition.vercel.app"),
    );
    assert.ok(allowedOrigins.includes("http://localhost:5173"));
    assert.ok(allowedOrigins.includes("http://127.0.0.1:5173"));
  });

  it("normalizes harmless trailing slashes", () => {
    assert.equal(
      normalizeOrigin("http://localhost:5173/"),
      "http://localhost:5173",
    );
  });

  it("accepts configured localhost and rejects unknown websites", async () => {
    assert.equal(await checkOrigin("http://localhost:5173"), true);
    await assert.rejects(
      checkOrigin("https://untrusted.example"),
      /Origin not allowed by CORS/,
    );
  });
});
