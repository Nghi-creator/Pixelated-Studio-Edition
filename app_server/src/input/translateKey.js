function translateKey(browserKey) {
  const keyMap = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    z: "z",
    x: "x",
    Enter: "Return",
    Shift: "Shift_R",
  };
  return keyMap[browserKey] || "";
}

module.exports = { translateKey };
