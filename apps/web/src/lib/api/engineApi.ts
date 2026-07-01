import type {
  ApiIceServersResponse,
  ApiLocalPairingResponse,
  ApiMultiplayerLobbyPayload,
} from "./apiTypes";

type EngineApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
};

export function createEngineApi({ apiRequest }: EngineApiDependencies) {
  return {
    clearLocalPairing: () =>
      apiRequest<void>("/local-pairings/current", {
        method: "DELETE",
      }),
    endMultiplayerLobby: (sessionId: string) =>
      apiRequest<void>(`/multiplayer/lobbies/${sessionId}`, {
        method: "DELETE",
      }),
    iceServers: () => apiRequest<ApiIceServersResponse>("/webrtc/ice-servers"),
    localPairing: () =>
      apiRequest<ApiLocalPairingResponse>("/local-pairings/current"),
    multiplayerLobby: (
      sessionId: string,
      payload: ApiMultiplayerLobbyPayload,
    ) =>
      apiRequest<{ lobby: unknown }>(`/multiplayer/lobbies/${sessionId}`, {
        body: JSON.stringify(payload),
        method: "PUT",
      }),
    pairLocalEngine: (engineUrl: string) =>
      apiRequest<ApiLocalPairingResponse>("/local-pairings", {
        body: JSON.stringify({ engineUrl }),
        method: "POST",
      }),
  };
}
