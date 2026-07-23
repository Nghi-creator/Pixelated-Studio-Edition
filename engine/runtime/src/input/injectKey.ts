import { execFile } from "child_process";
import { xdotoolArgs } from "../runtime/processes/processCommands";

export type KeyAction = "keydown" | "keyup";

const MAX_CONCURRENT_KEY_INJECTIONS = 8;
let activeKeyInjections = 0;

export function injectKey(action: KeyAction, linuxKey: string): void {
  if (activeKeyInjections >= MAX_CONCURRENT_KEY_INJECTIONS) return;

  activeKeyInjections += 1;
  execFile("xdotool", xdotoolArgs(action, linuxKey), {
    env: { ...process.env, DISPLAY: ":99" },
  }, () => {
    activeKeyInjections = Math.max(0, activeKeyInjections - 1);
  });
}
