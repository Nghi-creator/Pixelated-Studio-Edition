import crypto from "node:crypto";
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
const MAX_CONNECTED_CLIENTS = 10_000;
const MAX_REVOKED_IDENTIFIERS = 10_000;
const clients = new Map<string, ConnectedClient>();
const socketIdsByClient = new Map<string, Set<string>>();
const revokedAccessIds = new Set<string>();
const revokedClientIds = new Set<string>();

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function normalizeClientId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value)
    ? value
    : "";
}

function getAccessScope(value: unknown): ClientAccessScope {
  return value === "companion-guest" || value === "companion-host"
    ? value
    : "raw";
}

export function getSocketAccessScope(socket: Socket): ClientAccessScope {
  return getAccessScope(
    getHeaderValue(socket.handshake.headers["x-pixelated-access-scope"]),
  );
}

export function getRequestAccessScope(req: Request): ClientAccessScope {
  return getAccessScope(req.get("x-pixelated-access-scope"));
}

function fallbackClientId(remoteAddress: string, userAgent: string) {
  return `implicit_${crypto
    .createHash("sha256")
    .update(`${remoteAddress}:${userAgent}`)
    .digest("base64url")}`;
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

function vaultOwnerId(accessScope: ClientAccessScope) {
  // The raw engine token and companion-host token are administrative
  // credentials for one engine-local vault. Client ids are caller-provided
  // routing identifiers, so they must never select a storage namespace.
  return accessScope === "companion-guest" ? "" : "local_engine";
}

export function getRequestVaultOwnerId(req: Request) {
  return vaultOwnerId(getRequestAccessScope(req));
}

export function getSocketVaultOwnerId(socket: Socket) {
  return vaultOwnerId(getSocketAccessScope(socket));
}

function upsertClient(
  clientId: string,
  patch: Omit<Partial<ConnectedClient>, "id">,
) {
  const now = new Date().toISOString();
  const existing = clients.get(clientId);
  if (!existing && clients.size >= MAX_CONNECTED_CLIENTS) {
    for (const [storedClientId, storedClient] of clients) {
      if (
        !socketIdsByClient.has(storedClientId) &&
        Date.now() - Date.parse(storedClient.lastSeenAt) > CLIENT_TTL_MS
      ) {
        clients.delete(storedClientId);
      }
    }
  }
  while (!existing && clients.size >= MAX_CONNECTED_CLIENTS) {
    const inactiveClientId = Array.from(clients.keys()).find(
      (storedClientId) => !socketIdsByClient.has(storedClientId),
    );
    if (!inactiveClientId) return null;
    clients.delete(inactiveClientId);
  }
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
  const socketIds = socketIdsByClient.get(clientId) || new Set<string>();
  socketIds.add(socket.id);
  socketIdsByClient.set(clientId, socketIds);
  socket.once("disconnect", () => {
    const activeSocketIds = socketIdsByClient.get(clientId);
    activeSocketIds?.delete(socket.id);
    if (activeSocketIds?.size === 0) socketIdsByClient.delete(clientId);
    const client = clients.get(clientId);
    if (client) {
      client.socketCount = activeSocketIds?.size || 0;
      client.lastSeenAt = new Date().toISOString();
    }
  });
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

  const socketCount = socketIdsByClient.get(clientId)?.size || 0;

  upsertClient(clientId, {
    accessId,
    accessScope: getSocketAccessScope(socket),
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
      const socketCount = socketIdsByClient.get(clientId)?.size || 0;
      const hasActiveSocket = socketCount > 0;

      if (hasActiveSocket) {
        client.lastSeenAt = new Date(now).toISOString();
        client.socketCount = socketCount;
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
  const safeClientId = normalizeClientId(clientId);
  if (!safeClientId) return 0;

  addBoundedRevocation(revokedClientIds, safeClientId);
  const client = clients.get(safeClientId);
  if (client?.accessId) {
    addBoundedRevocation(revokedAccessIds, client.accessId);
  }
  clients.delete(safeClientId);
  let disconnected = 0;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.engineClientId !== safeClientId) continue;
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

function addBoundedRevocation(target: Set<string>, value: string) {
  target.delete(value);
  target.add(value);
  while (target.size > MAX_REVOKED_IDENTIFIERS) {
    const oldest = target.values().next().value;
    if (typeof oldest !== "string") break;
    target.delete(oldest);
  }
}

export function registerConnectedClientRoutes(
  app: Express,
  options: {
    io: Server;
    requireEngineToken: RequestHandler;
  },
) {
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
