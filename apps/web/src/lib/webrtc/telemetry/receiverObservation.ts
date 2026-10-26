/** Challenge-scoped, read-only declared playback observations. No probe requests. */
export type ReceiverChallenge = { peerId: string; bindingId: string; offerHash: string };
export type ReceiverObservation = {
  peerId: string; bindingId: string; clockId: string; sequence: number;
  elapsedNs: number; framesDecoded: number; presentedFrames: number;
};

export function parseReceiverChallenge(value: unknown): ReceiverChallenge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).length !== 3 || !["peerId", "bindingId", "offerHash"].every((key) => Object.hasOwn(fields, key)) || typeof fields.peerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(fields.peerId) ||
      typeof fields.bindingId !== "string" || !/^[a-f0-9]{64}$/.test(fields.bindingId) ||
      typeof fields.offerHash !== "string" || !/^[a-f0-9]{64}$/.test(fields.offerHash)) return null;
  return { peerId: fields.peerId, bindingId: fields.bindingId, offerHash: fields.offerHash };
}

export async function offerDigest(sdp: string) {
  const value = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sdp));
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function startReceiverObservation({ pc, challenge, getVideo, getStream, isCurrent, emit,
  now = () => performance.now(), schedule = (callback, delay) => window.setTimeout(callback, delay),
  cancel = (handle) => window.clearTimeout(handle), clockId = `rx_${crypto.randomUUID().replaceAll("-", "")}`,
}: {
  pc: RTCPeerConnection; challenge: ReceiverChallenge;
  getVideo: () => HTMLVideoElement | null; getStream: () => MediaStream | null;
  isCurrent: () => boolean; emit: (sample: ReceiverObservation) => void;
  now?: () => number; schedule?: (callback: () => void, delay: number) => number;
  cancel?: (handle: number) => void; clockId?: string;
}) {
  let active = true;
  let timer: number | null = null;
  let frame: number | null = null;
  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let presented: number | null = null;
  let previousPresented = -1;
  let previousDecoded = -1;
  let previousTimestamp = -Infinity;
  let previousNow = -Infinity;
  let statsId: string | null = null;
  let sequence = 0;
  const origin = now();
  const stop = () => {
    active = false;
    if (timer !== null) cancel(timer);
    if (frame !== null && video) video.cancelVideoFrameCallback(frame);
    timer = frame = null;
  };
  const current = () => active && isCurrent() && (!video ||
    (getVideo() === video && getStream() === stream && video.srcObject === stream));
  const onFrame: VideoFrameRequestCallback = (_at, metadata) => {
    frame = null;
    if (!current() || !integer(metadata.presentedFrames) || metadata.presentedFrames < previousPresented) { stop(); return; }
    presented = previousPresented = metadata.presentedFrames;
    frame = video!.requestVideoFrameCallback(onFrame);
  };
  async function sample() {
    timer = null;
    if (!current()) { stop(); return; }
    const stamp = now();
    if (!Number.isFinite(stamp) || stamp < previousNow || stamp < origin) { stop(); return; }
    previousNow = stamp;
    if (!video) {
      const candidate = getVideo();
      const incoming = getStream();
      if (!candidate || !incoming || candidate.srcObject !== incoming || pc.connectionState !== "connected") {
        if (stamp - origin > 5000) { stop(); return; }
        timer = schedule(() => { void sample(); }, 100);
        return;
      }
      if (typeof candidate.requestVideoFrameCallback !== "function" || typeof candidate.cancelVideoFrameCallback !== "function") { stop(); return; }
      video = candidate; stream = incoming;
      frame = video.requestVideoFrameCallback(onFrame);
    }
    if (pc.connectionState !== "connected" || !["connected", "completed"].includes(pc.iceConnectionState)) { stop(); return; }
    try {
      const report = await pc.getStats(); // One in-flight request; no overlapping poll.
      if (!current()) { stop(); return; }
      const tracks = pc.getReceivers().map((receiver) => receiver.track).filter((track) => track?.kind === "video" && track.readyState === "live");
      if (tracks.length !== 1 || !stream!.getVideoTracks().some((track) => track.id === tracks[0]!.id)) { stop(); return; }
      const inbound: Array<Record<string, unknown>> = [];
      report.forEach((record) => {
        const value = record as Record<string, unknown>;
        if (value.type === "inbound-rtp" && (value.kind === "video" || value.mediaType === "video") && value.isRemote !== true && value.trackIdentifier === tracks[0]!.id) inbound.push(value);
      });
      if (inbound.length === 0 && statsId === null && now() - origin <= 5000) {
        timer = schedule(() => { void sample(); }, 200);
        return; // Connected can precede the first inbound stats record.
      }
      if (inbound.length !== 1) { stop(); return; }
      const value = inbound[0]!;
      if (value.framesDecoded === undefined && statsId === null && now() - origin <= 5000) {
        timer = schedule(() => { void sample(); }, 200);
        return; // Never substitute zero for an uninitialized decoder counter.
      }
      if (typeof value.id !== "string" || value.id.length > 1024 || !integer(value.ssrc) || !integer(value.framesDecoded) ||
          typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp) || value.timestamp <= previousTimestamp ||
          value.framesDecoded < previousDecoded) { stop(); return; }
      const identity = `${value.id}:${value.ssrc}`;
      if (statsId !== null && statsId !== identity) { stop(); return; }
      statsId = identity;
      previousTimestamp = value.timestamp;
      previousDecoded = value.framesDecoded;
      const completedAt = now();
      const elapsedNs = Math.round((completedAt - origin) * 1e6);
      if (!Number.isFinite(completedAt) || completedAt < stamp || completedAt - stamp > 500 || !integer(elapsedNs)) { stop(); return; }
      if (presented !== null) {
        emit({ peerId: challenge.peerId, bindingId: challenge.bindingId, clockId, sequence,
          elapsedNs, framesDecoded: value.framesDecoded, presentedFrames: presented });
        sequence += 1;
      }
      if (current()) timer = schedule(() => { void sample(); }, 200);
    } catch { stop(); }
  }
  void sample();
  return stop;
}
