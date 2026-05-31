const keyMaps: Record<number, Record<string, string>> = {
  1: {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    z: "z",
    x: "x",
    Enter: "Return",
    Shift: "Shift_R",
  },
  2: {
    ArrowUp: "w",
    ArrowDown: "s",
    ArrowLeft: "a",
    ArrowRight: "d",
    z: "f",
    x: "g",
    Enter: "r",
    Shift: "t",
  },
};

export function translateKey(
  browserKey: unknown,
  playerIndex = 1,
): string {
  if (typeof browserKey !== "string") return "";

  const keyMap = keyMaps[playerIndex] || {};
  return keyMap[browserKey] || "";
}
