import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { Socket } from "socket.io";

export function createEngineTokenAuth(engineToken: string) {
  function isValidEngineToken(token: unknown) {
    if (!engineToken) return true;
    if (typeof token !== "string" || !token) return false;

    const expected = Buffer.from(engineToken);
    const actual = Buffer.from(token);

    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  function requireEngineToken(req: Request, res: Response, next: NextFunction) {
    if (isValidEngineToken(req.get("x-engine-token"))) {
      next();
      return;
    }

    res.status(401).json({ error: "Invalid engine pairing token" });
  }

  function useSocketEngineToken(socket: Socket, next: (err?: Error) => void) {
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
