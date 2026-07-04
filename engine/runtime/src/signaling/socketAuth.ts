import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { Socket } from "socket.io";

type EngineTokenAuthOptions = {
  allowMissingToken?: boolean;
  getRequestAccessId?: (req: Request) => string;
  getRequestClientId?: (req: Request) => string;
  getSocketAccessId?: (socket: Socket) => string;
  getSocketClientId?: (socket: Socket) => string;
  isAccessRevoked?: (accessId: string) => boolean;
  isClientRevoked?: (clientId: string) => boolean;
  onHttpAuthenticated?: (req: Request) => void;
};

export function createEngineTokenAuth(
  engineToken: string,
  options: EngineTokenAuthOptions = {},
) {
  function isValidEngineToken(token: unknown) {
    if (!engineToken) return options.allowMissingToken === true;
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
      const accessId = options.getRequestAccessId?.(req) || "";
      const clientId = options.getRequestClientId?.(req) || "";
      if (
        (clientId && options.isClientRevoked?.(clientId)) ||
        (accessId && options.isAccessRevoked?.(accessId))
      ) {
        res.status(401).json({ error: "Engine access revoked" });
        return;
      }
      options.onHttpAuthenticated?.(req);
      next();
      return;
    }

    res.status(401).json({ error: "Invalid engine pairing token" });
  }

  function useSocketEngineToken(socket: Socket, next: (err?: Error) => void) {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers["x-engine-token"];

    if (isValidEngineToken(token)) {
      const accessId = options.getSocketAccessId?.(socket) || "";
      const clientId = options.getSocketClientId?.(socket) || "";
      if (
        (clientId && options.isClientRevoked?.(clientId)) ||
        (accessId && options.isAccessRevoked?.(accessId))
      ) {
        next(new Error("Invalid engine pairing token"));
        return;
      }
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
