function translateKey(browserKey, playerIndex = 1) {
  const keyMaps = {
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
  const keyMap = keyMaps[playerIndex] || {};
  return keyMap[browserKey] || "";
}

module.exports = { translateKey };
