import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("N4 host collector and fake pad lifecycle regressions pass", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "tests/python", "-p", "test_camera_trace*.py", "-v"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran \d+ tests/);
});

test("camera installs optional hooks before playback and closes them before teardown", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "camera.py"), "utf8");
  assert.match(source, /ximagesrc name=video_capture/);
  assert.ok(source.indexOf("install_host_trace(pipeline") < source.indexOf("pipeline.set_state(Gst.State.PLAYING)"));
  assert.ok(source.indexOf("stage_trace.close(reason)") < source.indexOf("pipeline.set_state(Gst.State.NULL)"));
  assert.match(source, /STAGE_TRACE = HostTraceRecording\(trace_config\) if trace_config is not None else None/);
  assert.match(source, /STAGE_TRACE.finish\("shutdown"\)/);
});
