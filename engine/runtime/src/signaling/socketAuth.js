const crypto = require("crypto");

function createEngineTokenAuth(engineToken) {
  function isValidEngineToken(token) {
    if (!engineToken) return true;
    if (typeof token !== "string" || !token) return false;

    const expected = Buffer.from(engineToken);
    const actual = Buffer.from(token);

    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  function requireEngineToken(req, res, next) {
    if (isValidEngineToken(req.get("x-engine-token"))) {
      next();
      return;
    }

    res.status(401).json({ error: "Invalid engine pairing token" });
  }

  function useSocketEngineToken(socket, next) {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers["x-engine-token"];

    if (isValidEngineToken(token)) {
      next();
      return;
    }

    next(new Error("Invalid engine pairing token"));
  }

  return {
    isValidEngineToken,
    requireEngineToken,
    useSocketEngineToken,
  };
}

module.exports = { createEngineTokenAuth };
