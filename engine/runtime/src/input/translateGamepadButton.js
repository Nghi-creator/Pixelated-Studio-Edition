function translateGamepadButton(browserKey) {
  const buttonMap = {
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    Enter: "start",
    Shift: "select",
    x: "a",
    z: "b",
  };

  return buttonMap[browserKey] || "";
}

module.exports = { translateGamepadButton };
