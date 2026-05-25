const { exec } = require("child_process");

function injectKey(action, linuxKey) {
  exec(`DISPLAY=:99 xdotool ${action} ${linuxKey}`);
}

module.exports = { injectKey };
