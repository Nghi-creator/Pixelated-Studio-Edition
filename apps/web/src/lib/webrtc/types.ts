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

export type EngineInputCapabilities = {
  limitationReason: string | null;
  source: "checking" | "health" | "unavailable";
  supportedPlayerCount: number;
};

export type WebRTCMode = "host" | "guest";

export type EngineShareContext = {
  companionUrls: string[];
  exposureMode: "local" | "lan" | "unknown";
};

export type UseWebRTCOptions = {
  displayName?: string;
  mode?: WebRTCMode;
  requestedRole?: LobbyRole;
  sessionId?: string | null;
};

