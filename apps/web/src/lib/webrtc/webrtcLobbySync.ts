import { ApiError, api } from "../api/apiClient";
import { getEngineUrl } from "../engine/engineConfig";
import { buildMultiplayerLobbyPayload } from "./lobbyMetadata";
import type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyState,
} from "./types";

type SyncMultiplayerLobbyOptions = {
  gameId: string;
  inputCapabilities: EngineInputCapabilities;
  lobbyState: LobbyState;
  sessionId: string;
  shareContext: EngineShareContext;
};

export function syncMultiplayerLobby({
  gameId,
  inputCapabilities,
  lobbyState,
  sessionId,
  shareContext,
}: SyncMultiplayerLobbyOptions) {
  api
    .multiplayerLobby(
      sessionId,
      buildMultiplayerLobbyPayload({
        engineUrl: getEngineUrl(),
        gameId,
        inputCapabilities,
        lobbyState,
        shareContext,
      }),
    )
    .catch((err) => {
      if (err instanceof ApiError && [401, 503].includes(err.status)) {
        return;
      }

      console.warn("[WebRTC] Failed to save multiplayer lobby:", err);
    });
}

export function endSyncedMultiplayerLobby(sessionId: string) {
  api.endMultiplayerLobby(sessionId).catch((err) => {
    if (err instanceof ApiError && [401, 503].includes(err.status)) {
      return;
    }

    console.warn("[WebRTC] Failed to end multiplayer lobby:", err);
  });
}
