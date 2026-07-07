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

export type WebRTCResearchEventName =
  | "answer_received"
  | "backend_session_created"
  | "backend_session_requested"
  | "connection_disconnected"
  | "connection_failed"
  | "connection_recovered"
  | "engine_error"
  | "engine_reconnect_waiting"
  | "engine_stop_stale_session_requested"
  | "offer_sent"
  | "python_ready"
  | "remote_track_received"
  | "retry_started"
  | "start_game_emitted"
  | "stream_playing";

export type UseWebRTCOptions = {
  displayName?: string;
  mode?: WebRTCMode;
  onResearchEvent?: (
    name: WebRTCResearchEventName,
    details?: Record<string, unknown>,
  ) => void;
  requestedRole?: LobbyRole;
  sessionId?: string | null;
};
