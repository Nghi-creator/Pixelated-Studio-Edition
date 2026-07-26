import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataBoundaryApp,
  FakeSupabase,
  OTHER_USER_ID,
  USER_ID,
} from "../support/dataBoundarySupport.js";

test("local pairings stay scoped to the authenticated user", async () => {
  const db = new FakeSupabase();
  const app = await createDataBoundaryApp(db, USER_ID);

  const createResponse = await app.inject({
    method: "POST",
    payload: { engineUrl: "http://localhost:8080/" },
    url: "/local-pairings",
  });
  assert.equal(createResponse.statusCode, 200);
  assert.equal(db.rows.local_engine_pairings[0]?.user_id, USER_ID);
  assert.equal(db.rows.local_engine_pairings[0]?.engine_url, "http://localhost:8080");

  const otherApp = await createDataBoundaryApp(db, OTHER_USER_ID);
  const otherResponse = await otherApp.inject({
    method: "GET",
    url: "/local-pairings/current",
  });
  assert.equal(otherResponse.statusCode, 404);
  await app.close();
  await otherApp.close();
});
