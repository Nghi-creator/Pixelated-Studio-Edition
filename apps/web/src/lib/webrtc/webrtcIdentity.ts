export const createWebRTCSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createWebRTCRetryIdentity = (hasFixedSession: boolean) => ({
  peerId: createWebRTCSessionId(),
  sessionId: hasFixedSession ? null : createWebRTCSessionId(),
});

export const createWebRTCProfileRestartIdentity = () => ({
  peerId: createWebRTCSessionId(),
  sessionId: null,
});
