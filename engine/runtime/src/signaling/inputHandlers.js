const { injectKey } = require("../input/injectKey");
const { translateKey } = require("../input/translateKey");

function registerInputHandlers(socket, runtime) {
  socket.on("keydown", (data = {}) => {
    if (data.sessionId && data.sessionId !== runtime.getActiveSessionId()) {
      return;
    }
    const linuxKey = translateKey(data.key);
    if (linuxKey) injectKey("keydown", linuxKey);
  });

  socket.on("keyup", (data = {}) => {
    if (data.sessionId && data.sessionId !== runtime.getActiveSessionId()) {
      return;
    }
    const linuxKey = translateKey(data.key);
    if (linuxKey) injectKey("keyup", linuxKey);
  });
}

module.exports = { registerInputHandlers };
