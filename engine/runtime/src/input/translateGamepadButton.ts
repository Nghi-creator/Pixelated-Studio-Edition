const buttonMap: Record<string, string> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Enter: "start",
  Shift: "select",
  x: "a",
  z: "b",
};

export function translateGamepadButton(browserKey: unknown): string {
  if (typeof browserKey !== "string") return "";

  return buttonMap[browserKey] || "";
}
