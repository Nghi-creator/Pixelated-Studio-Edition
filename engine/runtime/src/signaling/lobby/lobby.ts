import type { Socket } from "socket.io";
import {
  createLobbyStateStore,
  type LobbyParticipant,
  type LobbyRole,
  type LobbyState,
} from "./lobbyState";
import { getSessionRoom, normalizeSessionId } from "../sessionRooms";

export type { LobbyParticipant, LobbyRole, LobbyState };

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

export function createLobbyManager(maxPlayers = 4) {
  const lobbyState = createLobbyStateStore(maxPlayers);

  function syncSocketParticipant(socket: LobbySocket, participant: LobbyParticipant) {
    socket.data.lobbyRole = participant.role;
    socket.data.playerIndex = participant.playerIndex;
    return participant;
  }

  function emitLobbyState(ioSocket: LobbySocket, sessionId: string) {
    const state = lobbyState.getLobbyState(sessionId);
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
    const participant = lobbyState.assignParticipant(
      socket.id,
      sessionId,
      requestedRole,
      displayName,
      socket.data.hostEligible !== false,
    );
    syncSocketParticipant(socket, participant);
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
    const participant = lobbyState.getParticipant(socket.id, sessionId);
    if (!participant) {
      socket.emit("lobby-error", { message: "Join the lobby first." });
      return null;
    }

    const updated = lobbyState.requestPlayerSlot(
      socket.id,
      sessionId,
      requestedSlot,
    );
    if (!updated) {
      socket.emit("lobby-error", { message: "No player slots are available." });
      return null;
    }

    syncSocketParticipant(socket, updated);
    emitLobbyState(socket, sessionId);
    return updated;
  }

  function releasePlayerSlot(socket: LobbySocket, payload: SlotPayload = {}) {
    const sessionId =
      normalizeSessionId(payload.sessionId) || socket.data.sessionId;
    if (!sessionId) return null;

    const participant = lobbyState.getParticipant(socket.id, sessionId);
    if (!participant || participant.role === "host") return participant;

    const updated = lobbyState.releasePlayerSlot(socket.id, sessionId);
    if (!updated) return null;

    syncSocketParticipant(socket, updated);
    emitLobbyState(socket, sessionId);
    return updated;
  }

  function canControlSession(socket: LobbySocket, sessionId: string | null) {
    return lobbyState.canControlSession(socket.id, sessionId);
  }

  function canSendInput(
    socket: LobbySocket,
    sessionId: string | null,
    playerIndex: number,
  ) {
    return lobbyState.canSendInput(socket.id, sessionId, playerIndex);
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

    const result = lobbyState.kickParticipant(
      socket.id,
      sessionId,
      targetSocketId,
    );
    if (!result.ok) {
      socket.emit("lobby-error", { message: result.reason });
      return false;
    }

    socket.to(targetSocketId).emit("lobby-kicked", { sessionId });
    emitLobbyState(socket, sessionId);
    return true;
  }

  function leaveLobby(socket: LobbySocket, sessionId?: string | null) {
    const safeSessionId =
      normalizeSessionId(sessionId) || socket.data.sessionId || null;
    if (!safeSessionId) return;

    if (lobbyState.leaveLobby(socket.id, safeSessionId)) {
      emitLobbyState(socket, safeSessionId);
    }
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
    canSendInput,
    getLobbyState: lobbyState.getLobbyState,
    joinLobby,
    kickParticipant,
    leaveLobby,
    registerLobbyHandlers,
    releasePlayerSlot,
    requestPlayerSlot,
  };
}
