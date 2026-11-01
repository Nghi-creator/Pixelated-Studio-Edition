import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("both runtime images ship the opted-in scenario harness and recording control", () => {
  for (const name of ["Dockerfile", "Dockerfile.native"]) {
    const source = fs.readFileSync(name, "utf8");
    assert.match(source, /COPY research \/app\/research/);
    assert.ok(fs.existsSync("research/scenario_harness/camera_runtime.py"));
    assert.ok(fs.existsSync("research/tracing/camera_trace_control.py"));
  }
});
