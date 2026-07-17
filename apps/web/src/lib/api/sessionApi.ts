import type {
  ApiGameSubmissionPayload,
  ApiSessionResponse,
} from "./apiTypes";

type SessionApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
};

export function createSessionApi({ apiRequest }: SessionApiDependencies) {
  return {
    createSession: (gameId: string, clientSessionId: string) =>
      apiRequest<ApiSessionResponse>("/sessions", {
        body: JSON.stringify({
          clientEdition: "studio",
          clientSessionId,
          gameId,
          mode: "cloud",
          runtimeKind: "webrtc",
        }),
        method: "POST",
      }),
    submitGame: (payload: ApiGameSubmissionPayload) =>
      apiRequest<{ submission: { id: string; status: "pending" } }>(
        "/submissions/games",
        {
          body: JSON.stringify(payload),
          method: "POST",
        },
      ),
  };
}
