import type { SupabaseService } from "../../auth/infrastructure/supabaseClients.js";

export type StreamMetricRow = {
  bitrate_kbps: number | null;
  connection_state: string;
  fps: number | null;
  ice_connection_state: string;
  jitter_ms: number | null;
  metric_timestamp: string;
  packets_lost: number;
  received_at: string;
  session_id: string;
};

export async function findLatestMetricAt(
  service: SupabaseService,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await service
    .from("stream_metrics")
    .select("received_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ received_at: string }>();
  if (error) throw error;
  return data ? Date.parse(data.received_at) : 0;
}

export async function insertStreamMetric(
  service: SupabaseService,
  input: {
    bitrateKbps: number | null;
    connectionState: string;
    fps: number | null;
    iceConnectionState: string;
    jitterMs: number | null;
    packetsLost: number;
    receivedAt: string;
    sessionId: string;
    timestamp: string;
    userId: string;
  },
) {
  const { error } = await service.from("stream_metrics").insert({
    bitrate_kbps: input.bitrateKbps,
    connection_state: input.connectionState,
    fps: input.fps,
    ice_connection_state: input.iceConnectionState,
    jitter_ms: input.jitterMs,
    metric_timestamp: input.timestamp,
    packets_lost: input.packetsLost,
    received_at: input.receivedAt,
    session_id: input.sessionId,
    user_id: input.userId,
  });
  if (error) throw error;
}

export async function findRecentStreamMetrics(
  service: SupabaseService,
  userId: string,
) {
  const { data, error } = await service
    .from("stream_metrics")
    .select("session_id,fps,bitrate_kbps,packets_lost,jitter_ms,ice_connection_state,connection_state,metric_timestamp,received_at")
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .limit(50)
    .returns<StreamMetricRow[]>();
  if (error) throw error;
  return data || [];
}
