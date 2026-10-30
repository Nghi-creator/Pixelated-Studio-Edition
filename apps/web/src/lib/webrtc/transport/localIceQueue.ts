/** One offer scope: preserve offer-before-candidate order and discard retired work. */
export function createLocalIceQueue({ isCurrent, send, onOverflow }: {
  isCurrent: () => boolean;
  send: (candidate: RTCIceCandidateInit) => void;
  onOverflow: () => void;
}) {
  let published = false, closed = false, count = 0;
  let pending: RTCIceCandidateInit[] = [];
  const current = () => !closed && isCurrent();
  return {
    add(candidate: RTCIceCandidateInit) {
      if (!current()) return;
      if (++count > 128) { closed = true; pending = []; onOverflow(); return; }
      if (published) send(candidate);
      else pending.push(candidate);
    },
    publish(sendOffer: () => void) {
      if (!current()) throw new Error("WebRTC offer scope retired before publication.");
      sendOffer();
      if (!current()) { pending = []; return; }
      published = true;
      const queued = pending; pending = [];
      for (const candidate of queued) {
        if (!current()) break;
        send(candidate);
      }
    },
    snapshot: () => ({ count, pending: pending.length, published, closed }),
  };
}
