import type { spawn } from "child_process";
import fs from "fs";
import { pulseAudioArgs } from "./processCommands";

const RETROARCH_CONFIG =
  'audio_driver = "pulse"\n' +
  'audio_sync = "true"\n' +
  'video_vsync = "false"\n' +
  'input_driver = "udev"\n' +
  'joypad_driver = "udev"\n' +
  'input_autodetect_enable = "true"\n' +
  'input_libretro_device_p1 = "1"\n' +
  'input_libretro_device_p2 = "1"\n' +
  'input_libretro_device_p3 = "1"\n' +
  'input_libretro_device_p4 = "1"\n' +
  'input_player1_up = "up"\n' +
  'input_player1_down = "down"\n' +
  'input_player1_left = "left"\n' +
  'input_player1_right = "right"\n' +
  'input_player1_b = "z"\n' +
  'input_player1_a = "x"\n' +
  'input_player1_l = "a"\n' +
  'input_player1_r = "s"\n' +
  'input_player1_start = "enter"\n' +
  'input_player1_select = "rshift"\n' +
  'input_player2_up = "w"\n' +
  'input_player2_down = "s"\n' +
  'input_player2_left = "a"\n' +
  'input_player2_right = "d"\n' +
  'input_player2_b = "f"\n' +
  'input_player2_a = "g"\n' +
  'input_player2_l = "q"\n' +
  'input_player2_r = "e"\n' +
  'input_player2_start = "r"\n' +
  'input_player2_select = "t"\n';

export function startRuntimeHostProcesses(spawnProcess: typeof spawn) {
  console.log("Booting Virtual Display (Xvfb) and PulseAudio...");

  if (fs.existsSync("/tmp/.X99-lock")) {
    fs.rmSync("/tmp/.X99-lock", { force: true });
  }
  if (fs.existsSync("/tmp/.X11-unix/X99")) {
    fs.rmSync("/tmp/.X11-unix/X99", { force: true, recursive: true });
  }

  const virtualDisplayProcess = spawnProcess("Xvfb", [
    ":99",
    "-screen",
    "0",
    "640x480x24",
  ]);
  const pulseAudioProcess = spawnProcess("pulseaudio", pulseAudioArgs);
  pulseAudioProcess.on("error", (err) => {
    console.error(`[Engine] PulseAudio failed to start: ${err.message}`);
  });

  fs.writeFileSync("/app/retroarch.cfg", RETROARCH_CONFIG);

  return {
    pulseAudioProcess,
    virtualDisplayProcess,
  };
}
