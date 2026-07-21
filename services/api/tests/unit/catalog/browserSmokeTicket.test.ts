import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserSmokeTicket,
  verifyBrowserSmokeTicket,
} from "../../../src/modules/catalog/domain/browserSmokeTicket.js";

const SECRET = "browser-smoke-test-secret-at-least-32-characters";
const NOW = Date.UTC(2026, 6, 18, 12, 0, 0);

test("browser smoke tickets are signed, candidate-bound, and expire", () => {
  const issued = createBrowserSmokeTicket(
    {
      artifactSha256: "a".repeat(64),
      candidateId: "78787878-7878-4878-8878-787878787878",
      coreId: "fceumm",
      reviewerId: "22222222-2222-4222-8222-222222222222",
    },
    SECRET,
    300,
    NOW,
  );
  const payload = verifyBrowserSmokeTicket(issued.ticket, SECRET, NOW + 1);
  assert.equal(payload.candidateId, "78787878-7878-4878-8878-787878787878");
  assert.equal(payload.artifactSha256, "a".repeat(64));
  assert.throws(
    () => verifyBrowserSmokeTicket(issued.ticket, SECRET, NOW + 300_000),
    /expired/,
  );
});

test("browser smoke tickets reject tampering and the wrong secret", () => {
  const issued = createBrowserSmokeTicket(
    {
      artifactSha256: "b".repeat(64),
      candidateId: "78787878-7878-4878-8878-787878787878",
      coreId: "fceumm",
      reviewerId: "22222222-2222-4222-8222-222222222222",
    },
    SECRET,
    300,
    NOW,
  );
  assert.throws(() => verifyBrowserSmokeTicket(`${issued.ticket}x`, SECRET, NOW));
  assert.throws(() => verifyBrowserSmokeTicket(issued.ticket, `${SECRET}-wrong`, NOW));
});
