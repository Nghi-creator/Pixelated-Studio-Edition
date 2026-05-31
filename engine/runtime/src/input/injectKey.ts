import { exec } from "child_process";

export type KeyAction = "keydown" | "keyup";

export function injectKey(action: KeyAction, linuxKey: string): void {
  exec(`DISPLAY=:99 xdotool ${action} ${linuxKey}`);
}
