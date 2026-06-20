import type { ApiMultiplayerLobbyPayload } from "../api/apiTypes";
import type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyState,
} from "./types";

type BuildMultiplayerLobbyPayloadOptions = {
  engineUrl: string | null;
  gameId: string;
  inputCapabilities: EngineInputCapabilities;
  lobbyState: LobbyState;
  shareContext: EngineShareContext;
};

export function buildMultiplayerLobbyPayload({
  engineUrl,
  gameId,
  inputCapabilities,
  lobbyState,
  shareContext,
}: BuildMultiplayerLobbyPayloadOptions): ApiMultiplayerLobbyPayload {
  return {
    engineUrl,
    exposureMode: shareContext.exposureMode,
    gameId,
    maxPlayers: Math.min(
      lobbyState.maxPlayers,
      inputCapabilities.supportedPlayerCount,
    ),
    participants: lobbyState.participants.map((entry) => ({
      displayName: entry.displayName,
      playerIndex: entry.playerIndex,
      role: entry.role,
    })),
  };
}
