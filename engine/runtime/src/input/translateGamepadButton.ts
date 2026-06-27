const buttonMap: Record<string, string> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Enter: "start",
  Shift: "select",
  a: "l",
  dpad_down: "down",
  dpad_left: "left",
  dpad_right: "right",
  dpad_up: "up",
  face_east: "a",
  face_south: "b",
  s: "r",
  select: "select",
  shoulder_left: "l",
  shoulder_right: "r",
  start: "start",
  x: "a",
  z: "b",
};

export function translateGamepadButton(browserKey: unknown): string {
  if (typeof browserKey !== "string") return "";

  return buttonMap[browserKey] || "";
}
