import type {
  EngineClientPayload,
  EngineHealthPayload,
} from "./controllerTypes";

type EngineTokenGetter = () => string | null;

async function requestEngineControl<T>(
  getEngineToken: EngineTokenGetter,
  pathName: string,
  options: { method?: "GET" | "POST" } = {},
) {
  const engineToken = getEngineToken();
  if (!engineToken) {
    throw new Error("Engine token has not been initialized.");
  }

  const response = await fetch(`http://127.0.0.1:8080${pathName}`, {
    headers: {
      "X-Engine-Token": engineToken,
    },
    method: options.method || "GET",
  });
  if (!response.ok) {
    throw new Error(`Engine control request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function listEngineClients(getEngineToken: EngineTokenGetter) {
  if (!getEngineToken()) return { clients: [] as EngineClientPayload[] };

  return requestEngineControl<{ clients: EngineClientPayload[] }>(
    getEngineToken,
    "/clients",
  );
}

export async function getEngineHealth(getEngineToken: EngineTokenGetter) {
  return requestEngineControl<EngineHealthPayload>(getEngineToken, "/health");
}

export async function stopActiveEngineSession(getEngineToken: EngineTokenGetter) {
  return requestEngineControl<{ sessionId?: string; stopped: boolean }>(
    getEngineToken,
    "/session/stop-active",
    { method: "POST" },
  );
}

export async function revokeEngineClient(
  getEngineToken: EngineTokenGetter,
  clientId: string,
) {
  return requestEngineControl<{ disconnected: number }>(
    getEngineToken,
    `/clients/${encodeURIComponent(clientId)}/revoke`,
    { method: "POST" },
  );
}
