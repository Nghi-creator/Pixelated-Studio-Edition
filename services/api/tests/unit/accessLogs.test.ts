import assert from "node:assert/strict";
import test from "node:test";
import { getAccessLogStorageErrorResponse } from "../../src/modules/observability/http/accessLogRoutes.js";

test("access-log storage errors identify missing hosted columns as schema drift", () => {
  const response = getAccessLogStorageErrorResponse(
    {
      code: "42703",
      message: 'column access_logs.path does not exist',
    },
    "Failed to create access log",
  );

  assert.equal(response.code, "access_log_schema_drift");
  assert.equal(response.details?.code, "42703");
  assert.deepEqual(response.migrations, [
    "20260603090000_repair_access_logs_path.sql",
    "20260604090000_access_log_sessions_summary.sql",
  ]);
});

test("access-log storage errors identify missing session upsert and summary contracts", () => {
  for (const code of ["42883", "42P01", "42P10", "PGRST202", "PGRST204"]) {
    assert.equal(
      getAccessLogStorageErrorResponse({ code }, "Failed to load access logs").code,
      "access_log_schema_drift",
    );
  }
});

test("access-log storage errors keep unrelated failures generic", () => {
  assert.deepEqual(
    getAccessLogStorageErrorResponse(
      { code: "08006", message: "connection failure" },
      "Failed to create access log",
    ),
    { error: "Failed to create access log" },
  );
});
