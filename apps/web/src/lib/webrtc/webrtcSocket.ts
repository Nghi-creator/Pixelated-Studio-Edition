import { io } from "socket.io-client";
import { getCompanionAccessToken } from "../engine/engineAuth";
import { getEngineClientId } from "../engine/engineClient";
import { getEngineUrl } from "../engine/engineConfig";

export type EngineSocket = ReturnType<typeof io>;

export function createEngineSocket(engineToken: string) {
  const companionAccessToken = getCompanionAccessToken(engineToken);
  const engineClientId = getEngineClientId();
  const socket = io(getEngineUrl(), {
    autoConnect: false,
    query: companionAccessToken
      ? {
          companionToken: companionAccessToken,
          pixelatedClientId: engineClientId,
        }
      : undefined,
  });

  socket.auth = companionAccessToken
    ? { clientId: engineClientId }
    : { clientId: engineClientId, token: engineToken };

  return socket;
}
