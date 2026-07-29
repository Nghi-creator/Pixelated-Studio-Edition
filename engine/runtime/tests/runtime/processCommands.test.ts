import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
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
