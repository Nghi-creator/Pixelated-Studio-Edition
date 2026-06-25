const keyMaps: Record<number, Record<string, string>> = {
  1: {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    z: "z",
    x: "x",
    a: "a",
    s: "s",
    dpad_up: "Up",
    dpad_down: "Down",
    dpad_left: "Left",
    dpad_right: "Right",
    face_south: "z",
    face_east: "x",
    shoulder_left: "a",
    shoulder_right: "s",
    start: "Return",
    select: "Shift_R",
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
    a: "q",
    s: "e",
    dpad_up: "w",
    dpad_down: "s",
    dpad_left: "a",
    dpad_right: "d",
    face_south: "f",
    face_east: "g",
    shoulder_left: "q",
    shoulder_right: "e",
    start: "r",
    select: "t",
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
