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

function makeParticipant(
  socketId: string,
  role: LobbyRole,
  displayName: string,
  playerIndex: number | null,
): LobbyParticipant {
  return {
    connectedAt: new Date().toISOString(),
    displayName,
    playerIndex,
    role,
    socketId,
  };
}

export function createLobbyStateStore(maxPlayers = 4) {
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

  function getParticipant(socketId: string, sessionId: string) {
    return getParticipants(sessionId).get(socketId) || null;
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
    socketId: string,
    sessionId: string,
    requestedRole: LobbyRole,
    displayName: string,
  ) {
    const participants = getParticipants(sessionId);
    const existing = participants.get(socketId);
    const hasHost = [...participants.values()].some(
      (participant) =>
        participant.role === "host" && participant.socketId !== socketId,
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

    const participant = makeParticipant(
      socketId,
      role,
      displayName,
      playerIndex,
    );
    participants.set(socketId, participant);
    return participant;
  }

  function requestPlayerSlot(
    socketId: string,
    sessionId: string,
    requestedSlot: number | null,
  ) {
    const participant = getParticipant(socketId, sessionId);
    if (!participant) return null;

    const participants = getParticipants(sessionId);
    const slotTaken = requestedSlot
      ? [...participants.values()].some(
          (entry) =>
            entry.socketId !== socketId && entry.playerIndex === requestedSlot,
        )
      : false;
    const playerIndex =
      requestedSlot && !slotTaken ? requestedSlot : getOpenPlayerIndex(sessionId);

    if (!playerIndex) return null;

    const updated = {
      ...participant,
      playerIndex,
      role: participant.role === "host" ? "host" : ("player" as LobbyRole),
    };
    participants.set(socketId, updated);
    return updated;
  }

  function releasePlayerSlot(socketId: string, sessionId: string) {
    const participant = getParticipant(socketId, sessionId);
    if (!participant || participant.role === "host") return participant;

    const updated = {
      ...participant,
      playerIndex: null,
      role: "spectator" as LobbyRole,
    };
    getParticipants(sessionId).set(socketId, updated);
    return updated;
  }

  function canControlSession(socketId: string, sessionId: string | null) {
    if (!sessionId) return false;
    const participants = getParticipants(sessionId);
    if (participants.size === 0) return true;
    return participants.get(socketId)?.role === "host";
  }

  function canSendInput(
    socketId: string,
    sessionId: string | null,
    playerIndex: number,
  ) {
    if (!sessionId || !Number.isInteger(playerIndex)) return false;
    const participants = sessions.get(sessionId);
    if (!participants || participants.size === 0) return true;

    const participant = participants.get(socketId);
    return (
      (participant?.role === "host" || participant?.role === "player") &&
      participant.playerIndex === playerIndex
    );
  }

  function kickParticipant(
    socketId: string,
    sessionId: string,
    targetSocketId: string,
  ) {
    if (!canControlSession(socketId, sessionId)) {
      return { ok: false, reason: "Only the host can kick players." };
    }

    const participants = getParticipants(sessionId);
    const target = participants.get(targetSocketId);
    if (!target || target.role === "host") {
      return { ok: false, reason: "Cannot kick that participant." };
    }

    participants.delete(targetSocketId);
    return { ok: true };
  }

  function leaveLobby(socketId: string, sessionId: string) {
    const participants = sessions.get(sessionId);
    if (!participants) return false;

    const wasHost = participants.get(socketId)?.role === "host";
    participants.delete(socketId);

    if (participants.size === 0) {
      sessions.delete(sessionId);
      return false;
    }

    if (wasHost) {
      const nextHost = [...participants.values()][0];
      participants.set(nextHost.socketId, {
        ...nextHost,
        playerIndex: 1,
        role: "host",
      });
    }

    return true;
  }

  return {
    assignParticipant,
    canControlSession,
    canSendInput,
    getLobbyState,
    getParticipant,
    leaveLobby,
    maxPlayers,
    releasePlayerSlot,
    requestPlayerSlot,
    kickParticipant,
  };
}
