type SessionPayload = {
  [key: string]: unknown;
  peerId?: unknown;
  sessionId?: unknown;
};

type CandidateEnvelope = {
  candidate?: SessionPayload;
  peerId?: unknown;
  sessionId?: unknown;
};

type NormalizedIceCandidate = {
  candidate: string;
  peerId: string;
  sdpMLineIndex: number;
  sdpMid?: string | null;
  usernameFragment?: string | null;
};

const MAX_PEER_ID_LENGTH = 128;
const MAX_ICE_CANDIDATE_LENGTH = 4 * 1024;
const MAX_ICE_FIELD_LENGTH = 256;
const MAX_WEBRTC_SDP_LENGTH = 64 * 1024;

function unwrapCandidate(payload: CandidateEnvelope | SessionPayload) {
  if (
    !("candidate" in payload) ||
    !payload.candidate ||
    typeof payload.candidate !== "object"
  ) {
    return payload;
  }

  return {
    ...payload.candidate,
    peerId: payload.peerId,
    sessionId: payload.sessionId,
  };
}

function normalizeOptionalIceString(value: unknown) {
  return value === null ||
    (typeof value === "string" && value.length <= MAX_ICE_FIELD_LENGTH)
    ? value
    : undefined;
}

export function getPeerId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const peerId = (payload as { peerId?: unknown }).peerId;
  return typeof peerId === "string" &&
    peerId.length > 0 &&
    peerId.length <= MAX_PEER_ID_LENGTH &&
    /^[a-zA-Z0-9_-]+$/.test(peerId)
    ? peerId
    : null;
}

export function normalizeIceCandidate(
  payload: CandidateEnvelope | SessionPayload,
): NormalizedIceCandidate | null {
  if (!payload || typeof payload !== "object") return null;
  const unwrapped = unwrapCandidate(payload) as Record<string, unknown>;
  const peerId = getPeerId(unwrapped);
  const candidate = unwrapped.candidate;
  if (
    !peerId ||
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_ICE_CANDIDATE_LENGTH
  ) {
    return null;
  }

  const sdpMLineIndex = unwrapped.sdpMLineIndex;
  if (
    !Number.isInteger(sdpMLineIndex) ||
    (sdpMLineIndex as number) < 0 ||
    (sdpMLineIndex as number) > 65_535
  ) {
    return null;
  }

  const sdpMid = normalizeOptionalIceString(unwrapped.sdpMid);
  const usernameFragment = normalizeOptionalIceString(
    unwrapped.usernameFragment,
  );
  if (
    (unwrapped.sdpMid !== undefined && sdpMid === undefined) ||
    (unwrapped.usernameFragment !== undefined &&
      usernameFragment === undefined)
  ) {
    return null;
  }

  return {
    candidate,
    peerId,
    sdpMLineIndex: sdpMLineIndex as number,
    ...(sdpMid !== undefined ? { sdpMid } : {}),
    ...(usernameFragment !== undefined ? { usernameFragment } : {}),
  };
}

export function isValidWebRtcOffer(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const { sdp, type } = payload as { sdp?: unknown; type?: unknown };
  return (
    typeof sdp === "string" &&
    sdp.length > 0 &&
    sdp.length <= MAX_WEBRTC_SDP_LENGTH &&
    (type === undefined || type === "offer")
  );
}

export function isValidWebRtcAnswer(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const { sdp, type } = payload as { sdp?: unknown; type?: unknown };
  return (
    typeof sdp === "string" &&
    sdp.length > 0 &&
    sdp.length <= MAX_WEBRTC_SDP_LENGTH &&
    type === "answer"
  );
}

export type { CandidateEnvelope, SessionPayload };
