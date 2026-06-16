import type { Express, Request, RequestHandler, Response } from "express";
import type { Server, Socket } from "socket.io";

export type ClientAccessScope = "companion-guest" | "companion-host" | "raw";

export type ConnectedClient = {
  accessId: string;
  accessScope: ClientAccessScope;
  connectedAt: string;
  id: string;
  lastSeenAt: string;
  remoteAddress: string;
  role: string;
  sessionId: string | null;
  socketCount: number;
  userAgent: string;
};

export type PublicConnectedClient = Omit<ConnectedClient, "accessId">;

const CLIENT_TTL_MS = 120_000;
const clients = new Map<string, ConnectedClient>();
const revokedAccessIds = new Set<string>();
const revokedClientIds = new Set<string>();
let ioRef: Server | null = null;

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function normalizeClientId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
    ? value
    : "";
}

function getAccessScope(value: unknown): ClientAccessScope {
  return value === "companion-guest" || value === "companion-host"
    ? value
    : "raw";
}

function fallbackClientId(remoteAddress: string, userAgent: string) {
  return `implicit:${Buffer.from(`${remoteAddress}:${userAgent}`).toString("base64url")}`;
}

function clientIdFromAccessId(accessId: string) {
  return accessId ? `access_${accessId}` : "";
}

export function isEngineClientRevoked(clientId: string) {
  return Boolean(clientId && revokedClientIds.has(clientId));
}

export function isEngineAccessRevoked(accessId: string) {
  return Boolean(accessId && revokedAccessIds.has(accessId));
}

export function getRequestClientId(req: Request) {
  return normalizeClientId(req.get("x-pixelated-client-id"));
}

export function getRequestAccessId(req: Request) {
  return normalizeClientId(req.get("x-pixelated-access-id"));
}

export function getSocketClientId(socket: Socket) {
  return (
    normalizeClientId(socket.handshake.auth?.clientId) ||
    normalizeClientId(socket.handshake.query.pixelatedClientId) ||
    normalizeClientId(getHeaderValue(socket.handshake.headers["x-pixelated-client-id"]))
  );
}

export function getSocketAccessId(socket: Socket) {
  return normalizeClientId(
    getHeaderValue(socket.handshake.headers["x-pixelated-access-id"]),
  );
}

function upsertClient(
  clientId: string,
  patch: Omit<Partial<ConnectedClient>, "id">,
) {
  const now = new Date().toISOString();
  const existing = clients.get(clientId);
  const next: ConnectedClient = {
    accessId: patch.accessId || existing?.accessId || "",
    accessScope: patch.accessScope || existing?.accessScope || "raw",
    connectedAt: existing?.connectedAt || now,
    id: clientId,
    lastSeenAt: now,
    remoteAddress: patch.remoteAddress || existing?.remoteAddress || "unknown",
    role: patch.role || existing?.role || "connected",
    sessionId:
      patch.sessionId !== undefined ? patch.sessionId : existing?.sessionId || null,
    socketCount: patch.socketCount ?? existing?.socketCount ?? 0,
    userAgent: patch.userAgent || existing?.userAgent || "unknown",
  };
  clients.set(clientId, next);
  return next;
}

export function trackHttpClient(req: Request) {
  const accessId = getRequestAccessId(req);
  const clientId = getRequestClientId(req) || clientIdFromAccessId(accessId);
  if (!clientId) return;

  const userAgent = req.get("user-agent") || "unknown";
  const remoteAddress = req.ip || req.socket.remoteAddress || "unknown";

  if (isEngineClientRevoked(clientId) || isEngineAccessRevoked(accessId)) return;

  upsertClient(clientId, {
    accessId,
    accessScope: getAccessScope(req.get("x-pixelated-access-scope")),
    remoteAddress,
    role: "paired",
    userAgent,
  });
}

export function trackConnectedClient(socket: Socket) {
  const userAgent = getHeaderValue(socket.handshake.headers["user-agent"]) || "unknown";
  const remoteAddress = socket.handshake.address || "unknown";
  const accessId = getSocketAccessId(socket);
  const clientId =
    getSocketClientId(socket) ||
    clientIdFromAccessId(accessId) ||
    fallbackClientId(remoteAddress, userAgent);

  socket.data.engineClientId = clientId;
  refreshConnectedClient(socket);
}

export function refreshConnectedClient(socket: Socket) {
  const clientId = typeof socket.data.engineClientId === "string"
    ? socket.data.engineClientId
    : getSocketClientId(socket);
  const accessId = getSocketAccessId(socket);
  if (
    !clientId ||
    isEngineClientRevoked(clientId) ||
    isEngineAccessRevoked(accessId)
  ) {
    return;
  }

  const socketCount = Array.from(socket.nsp.sockets.values()).filter(
    (entry) => entry.data.engineClientId === clientId,
  ).length;

  upsertClient(clientId, {
    accessId,
    accessScope: getAccessScope(
      getHeaderValue(socket.handshake.headers["x-pixelated-access-scope"]),
    ),
    remoteAddress: socket.handshake.address || "unknown",
    role: typeof socket.data.role === "string" ? socket.data.role : "connected",
    sessionId:
      typeof socket.data.sessionId === "string" ? socket.data.sessionId : null,
    socketCount,
    userAgent: getHeaderValue(socket.handshake.headers["user-agent"]) || "unknown",
  });
}

export function listConnectedClients(now = Date.now()): PublicConnectedClient[] {
  for (const [clientId, client] of clients) {
    if (now - Date.parse(client.lastSeenAt) > CLIENT_TTL_MS) {
      const hasActiveSocket =
        ioRef &&
        Array.from(ioRef.sockets.sockets.values()).some(
          (socket) => socket.data.engineClientId === clientId,
        );

      if (hasActiveSocket) {
        client.lastSeenAt = new Date(now).toISOString();
        client.socketCount = Array.from(ioRef!.sockets.sockets.values()).filter(
          (socket) => socket.data.engineClientId === clientId,
        ).length;
      } else {
        clients.delete(clientId);
      }
    }
  }

  return Array.from(clients.values())
    .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt))
    .map(({ accessId: _accessId, ...client }) => client);
}

export function revokeConnectedClient(io: Server, clientId: string) {
  if (!clientId) return 0;

  revokedClientIds.add(clientId);
  const client = clients.get(clientId);
  if (client?.accessId) {
    revokedAccessIds.add(client.accessId);
  }
  clients.delete(clientId);
  let disconnected = 0;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.engineClientId !== clientId) continue;
    socket.emit("engine-error", {
      code: "engine_access_revoked",
      message:
        "Host revoked this browser's engine access. Pair the local engine again to continue.",
    });
    socket.disconnect(true);
    disconnected += 1;
  }

  return disconnected;
}

export function registerConnectedClientRoutes(
  app: Express,
  options: {
    io: Server;
    requireEngineToken: RequestHandler;
  },
) {
  ioRef = options.io;
  app.get("/clients", options.requireEngineToken, (_req: Request, res: Response) => {
    res.json({ clients: listConnectedClients() });
  });

  app.post(
    "/clients/:clientId/revoke",
    options.requireEngineToken,
    (req: Request, res: Response) => {
      const clientId = getHeaderValue(req.params.clientId);
      res.json({
        disconnected: revokeConnectedClient(options.io, clientId),
      });
    },
  );
}
