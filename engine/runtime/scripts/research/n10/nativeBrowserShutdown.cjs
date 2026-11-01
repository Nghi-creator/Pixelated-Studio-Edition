/** Close only this disposable fixture's connections, including unused HTTP sockets. */
function ownRelayShutdown(server, io) {
  const sockets = new Set();
  let closing = false;
  let pending;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    if (closing) socket.destroy();
  });
  return function close() {
    if (pending) return pending;
    closing = true;
    // Socket.IO closes its HTTP listener asynchronously. Reject any connection
    // accepted during that transition and release every already-owned socket.
    pending = io.close();
    for (const socket of sockets) socket.destroy();
    return pending;
  };
}
module.exports = { ownRelayShutdown };
