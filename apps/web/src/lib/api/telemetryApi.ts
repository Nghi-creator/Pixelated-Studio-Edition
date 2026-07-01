import type { ApiStreamMetricPayload } from "./apiTypes";

type TelemetryApiDependencies = {
  apiRequest: <T>(path: string, options?: RequestInit & { authenticated?: boolean; timeoutMs?: number }) => Promise<T>;
};

export function createTelemetryApi({ apiRequest }: TelemetryApiDependencies) {
  return {
    health: () =>
      apiRequest<{
        environment: string;
        ok: boolean;
        service: string;
        uptimeSeconds: number;
      }>("/health", { authenticated: false }),
    logAccess: (path: string, sessionId: string) =>
      apiRequest<{ success: true }>("/access-logs", {
        body: JSON.stringify({ path, sessionId }),
        method: "POST",
      }),
    streamMetric: (metric: ApiStreamMetricPayload) =>
      apiRequest<{ accepted: boolean; reason?: string }>("/metrics/stream", {
        body: JSON.stringify(metric),
        method: "POST",
      }),
  };
}
