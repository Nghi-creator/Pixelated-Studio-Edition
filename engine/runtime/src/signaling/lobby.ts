import type { Socket } from "socket.io";
import { getSessionRoom, normalizeSessionId } from "./sessionRooms";

export type LobbyRole = "host" | "player" | "spectator";

export type LobbyParticipant = {
  connectedAt: string;
  displayName: string;
  playerIndex: number | null;
  role: LobbyRole;
  socketId: string;
};

export type LobbyState = {
  hostSocketId: string | null;
  maxPlayers: number;
  participants: LobbyParticipant[];
  sessionId: string;
};

type JoinLobbyPayload = {
  displayName?: unknown;
  requestedRole?: unknown;
  sessionId?: unknown;
};

type SlotPayload = {
  playerIndex?: unknown;
  sessionId?: unknown;
};

type KickPayload = {
  sessionId?: unknown;
  socketId?: unknown;
};

type LobbySocket = Pick<Socket, "data" | "emit" | "id" | "to">;

function normalizeDisplayName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 40) : fallback;
}

function normalizeRole(value: unknown): LobbyRole {
  return value === "host" || value === "player" || value === "spectator"
    ? value
    : "spectator";
}

function normalizePlayerIndex(value: unknown, maxPlayers: number) {
  const playerIndex = Number(value);
  return Number.isInteger(playerIndex) &&
    playerIndex >= 1 &&
    playerIndex <= maxPlayers
    ? playerIndex
    : null;
}

function makeParticipant(
  socket: LobbySocket,
  role: LobbyRole,
  displayName: string,
  playerIndex: number | null,
): LobbyParticipant {
  return {
    connectedAt: new Date().toISOString(),
    displayName,
    playerIndex,
    role,
    socketId: socket.id,
  };
}

export function createLobbyManager(maxPlayers = 4) {
  const sessions = new Map<string, Map<string, LobbyParticipant>>();

  function getParticipants(sessionId: string) {
    let participants = sessions.get(sessionId);
    if (!participants) {
      participants = new Map();
      sessions.set(sessionId, participants);
    }
    return participants;
  }

  function getLobbyState(sessionId: string): LobbyState {
    const participants = [...getParticipants(sessionId).values()];
    const host = participants.find((participant) => participant.role === "host");

    return {
      hostSocketId: host?.socketId || null,
      maxPlayers,
      participants,
      sessionId,
    };
  }

  function getParticipant(socket: LobbySocket, sessionId: string) {
    return getParticipants(sessionId).get(socket.id) || null;
  }

  function getOpenPlayerIndex(sessionId: string) {
    const usedSlots = new Set(
      [...getParticipants(sessionId).values()]
        .map((participant) => participant.playerIndex)
        .filter((playerIndex): playerIndex is number => playerIndex !== null),
    );

    for (let playerIndex = 1; playerIndex <= maxPlayers; playerIndex += 1) {
      if (!usedSlots.has(playerIndex)) return playerIndex;
    }

    return null;
  }

  function assignParticipant(
    socket: LobbySocket,
    sessionId: string,
    requestedRole: LobbyRole,
    displayName: string,
  ) {
    const participants = getParticipants(sessionId);
    const existing = participants.get(socket.id);
    const hasHost = [...participants.values()].some(
      (participant) =>
        participant.role === "host" && participant.socketId !== socket.id,
    );

    let role = requestedRole;
    let playerIndex: number | null = existing?.playerIndex || null;

    if (role === "host" && hasHost) {
      role = "spectator";
      playerIndex = null;
    } else if (!hasHost && !existing) {
      role = "host";
      playerIndex = 1;
    } else if (role === "player") {
      playerIndex = playerIndex || getOpenPlayerIndex(sessionId);
      if (!playerIndex) role = "spectator";
    } else if (role === "spectator") {
      playerIndex = null;
    }

    const participant = makeParticipant(socket, role, displayName, playerIndex);
    participants.set(socket.id, participant);
    socket.data.lobbyRole = participant.role;
    socket.data.playerIndex = participant.playerIndex;

    return participant;
  }

  function emitLobbyState(ioSocket: LobbySocket, sessionId: string) {
    const state = getLobbyState(sessionId);
    ioSocket.emit("lobby-state", state);
    ioSocket.to(getSessionRoom(sessionId)).emit("lobby-state", state);
    return state;
  }

  function joinLobby(socket: LobbySocket, payload: JoinLobbyPayload = {}) {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    if (!sessionId) {
      socket.emit("lobby-error", { message: "Missing session id." });
      return null;
    }

    socket.data.sessionId = sessionId;
    const displayName = normalizeDisplayName(
      payload.displayName,
      `Player ${socket.id.slice(0, 4)}`,
    );
    const requestedRole = normalizeRole(payload.requestedRole);
    const participant = assignParticipant(
      socket,
      sessionId,
      requestedRole,
      displayName,
    );
    emitLobbyState(socket, sessionId);
    return participant;
  }

  function requestPlayerSlot(socket: LobbySocket, payload: SlotPayload = {}) {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    if (!sessionId) {
      socket.emit("lobby-error", { message: "Missing session id." });
      return null;
    }

    const requestedSlot = normalizePlayerIndex(payload.playerIndex, maxPlayers);
    const participant = getParticipant(socket, sessionId);
    if (!participant) {
      socket.emit("lobby-error", { message: "Join the lobby first." });
      return null;
    }

    const participants = getParticipants(sessionId);
    const slotTaken = requestedSlot
      ? [...participants.values()].some(
          (entry) =>
            entry.socketId !== socket.id && entry.playerIndex === requestedSlot,
        )
      : false;
    const playerIndex =
      requestedSlot && !slotTaken ? requestedSlot : getOpenPlayerIndex(sessionId);

    if (!playerIndex) {
      socket.emit("lobby-error", { message: "No player slots are available." });
      return null;
    }

    const updated = {
      ...participant,
      playerIndex,
      role: participant.role === "host" ? "host" : ("player" as LobbyRole),
    };
    participants.set(socket.id, updated);
    socket.data.lobbyRole = updated.role;
    socket.data.playerIndex = updated.playerIndex;
    emitLobbyState(socket, sessionId);
    return updated;
  }

  function releasePlayerSlot(socket: LobbySocket, payload: SlotPayload = {}) {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    if (!sessionId) return null;

    const participant = getParticipant(socket, sessionId);
    if (!participant || participant.role === "host") return participant;

    const updated = {
      ...participant,
      playerIndex: null,
      role: "spectator" as LobbyRole,
    };
    getParticipants(sessionId).set(socket.id, updated);
    socket.data.lobbyRole = updated.role;
    socket.data.playerIndex = updated.playerIndex;
    emitLobbyState(socket, sessionId);
    return updated;
  }

  function canControlSession(socket: LobbySocket, sessionId: string | null) {
    if (!sessionId) return false;
    const participants = getParticipants(sessionId);
    if (participants.size === 0) return true;
    return participants.get(socket.id)?.role === "host";
  }

  function kickParticipant(socket: LobbySocket, payload: KickPayload = {}) {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    const targetSocketId =
      typeof payload.socketId === "string" ? payload.socketId : "";

    if (!sessionId || !targetSocketId) {
      socket.emit("lobby-error", { message: "Missing kick target." });
      return false;
    }

    if (!canControlSession(socket, sessionId)) {
      socket.emit("lobby-error", { message: "Only the host can kick players." });
      return false;
    }

    const participants = getParticipants(sessionId);
    const target = participants.get(targetSocketId);
    if (!target || target.role === "host") {
      socket.emit("lobby-error", { message: "Cannot kick that participant." });
      return false;
    }

    participants.delete(targetSocketId);
    socket.to(targetSocketId).emit("lobby-kicked", { sessionId });
    emitLobbyState(socket, sessionId);
    return true;
  }

  function leaveLobby(socket: LobbySocket, sessionId?: string | null) {
    const safeSessionId =
      normalizeSessionId(sessionId) || socket.data.sessionId || null;
    if (!safeSessionId) return;

    const participants = sessions.get(safeSessionId);
    if (!participants) return;

    const wasHost = participants.get(socket.id)?.role === "host";
    participants.delete(socket.id);

    if (participants.size === 0) {
      sessions.delete(safeSessionId);
      return;
    }

    if (wasHost) {
      const nextHost = [...participants.values()][0];
      participants.set(nextHost.socketId, {
        ...nextHost,
        playerIndex: 1,
        role: "host",
      });
    }

    emitLobbyState(socket, safeSessionId);
  }

  function registerLobbyHandlers(socket: Socket) {
    socket.on("join-lobby", (payload: JoinLobbyPayload = {}) => {
      joinLobby(socket, payload);
    });

    socket.on("request-player-slot", (payload: SlotPayload = {}) => {
      requestPlayerSlot(socket, payload);
    });

    socket.on("release-player-slot", (payload: SlotPayload = {}) => {
      releasePlayerSlot(socket, payload);
    });

    socket.on("lobby-kick", (payload: KickPayload = {}) => {
      kickParticipant(socket, payload);
    });

    socket.on("disconnect", () => {
      leaveLobby(socket);
    });
  }

  return {
    canControlSession,
    getLobbyState,
    joinLobby,
    kickParticipant,
    leaveLobby,
    registerLobbyHandlers,
    releasePlayerSlot,
    requestPlayerSlot,
  };
}
