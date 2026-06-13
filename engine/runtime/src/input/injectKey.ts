import { execFile } from "child_process";
import { xdotoolArgs } from "../runtime/processCommands";

export type KeyAction = "keydown" | "keyup";

export function injectKey(action: KeyAction, linuxKey: string): void {
  execFile("xdotool", xdotoolArgs(action, linuxKey), {
    env: { ...process.env, DISPLAY: ":99" },
  }, () => undefined);
}
