import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { HEALTH_PATHS } from "../../src/config";
import { pulseAudioArgs } from "../../src/runtime/processes/processCommands";
import { RETROARCH_CONFIG } from "../../src/runtime/processes/runtimeHostProcesses";

test("process commands preserve the PulseAudio runtime configuration", () => {
  assert.deepEqual(pulseAudioArgs, [
    "--daemonize=yes",
    "--exit-idle-time=-1",
    "--disable-shm=yes",
    "--load=module-native-protocol-tcp auth-anonymous=1",
  ]);
});

test("RetroArch preserves crisp pixels before stream capture", () => {
  assert.match(RETROARCH_CONFIG, /video_smooth = "false"/);
  assert.match(RETROARCH_CONFIG, /video_scale_integer = "true"/);
});

test("camera bridge enforces a bounded global WebRTC peer limit", () => {
  const cameraSource = fs.readFileSync(
    path.resolve(process.cwd(), "camera.py"),
    "utf8",
  );

  assert.match(cameraSource, /PIXELATED_MAX_STREAM_PEERS/);
  assert.match(cameraSource, /len\(peers\) >= MAX_ACTIVE_PEERS/);
});

test("camera bridge validates and parses offers before allocating pipelines", () => {
  const cameraSource = fs.readFileSync(
    path.resolve(process.cwd(), "camera.py"),
    "utf8",
  );

  const validationIndex = cameraSource.indexOf("validation_error = validate_offer");
  const sdpParseIndex = cameraSource.indexOf("SDPMessage.new_from_text");
  const pipelineIndex = cameraSource.indexOf("Gst.parse_launch");

  assert.ok(validationIndex >= 0);
  assert.ok(sdpParseIndex > validationIndex);
  assert.ok(pipelineIndex > sdpParseIndex);
});

test("camera bridge publishes bounded atomic encoder telemetry", () => {
  const cameraSource = fs.readFileSync(
    path.resolve(process.cwd(), "camera.py"),
    "utf8",
  );
  const cameraStateSource = fs.readFileSync(
    path.resolve(process.cwd(), "camera_state.py"),
    "utf8",
  );

  assert.match(cameraSource, /PIXELATED_CAMERA_TELEMETRY_STATE_PATH/);
  assert.match(cameraStateSource, /os\.replace\(temporary_path, file_path\)/);
  assert.match(cameraStateSource, /framesDroppedTotal/);
  assert.match(cameraStateSource, /["']pipelineDelayProxyMs["']:\s*None/);
});

test("camera state stays outside the shared operating-system temp directory", () => {
  assert.equal(path.dirname(HEALTH_PATHS.cameraPeerState), "/run/pixelated");
  assert.equal(path.dirname(HEALTH_PATHS.cameraTelemetryState), "/run/pixelated");
});
