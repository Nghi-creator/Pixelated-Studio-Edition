/** Read-only observations. Identity comes from the relay, never payload role claims. */
export type ReceiverChallenge = { peerId: string; bindingId: string; offerHash: string };
export type ReceiverObservation = {
  peerId: string; bindingId: string; clockId: string; sequence: number;
  elapsedNs: number; framesDecoded: number; presentedFrames: number;
};

function shape(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const alias = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function receiverChallenge(value: unknown): ReceiverChallenge | null {
  if (!shape(value, ["peerId", "bindingId", "offerHash"]) || !alias(value.peerId) || !hash(value.bindingId) || !hash(value.offerHash)) return null;
  return { peerId: value.peerId, bindingId: value.bindingId, offerHash: value.offerHash };
}

export function receiverObservation(value: unknown): ReceiverObservation | null {
  if (!shape(value, ["peerId", "bindingId", "clockId", "sequence", "elapsedNs", "framesDecoded", "presentedFrames"]) ||
      !alias(value.peerId) || !hash(value.bindingId) || !alias(value.clockId) || value.clockId.length > 64 ||
      !integer(value.sequence) || !integer(value.elapsedNs) || !integer(value.framesDecoded) || !integer(value.presentedFrames)) return null;
  return { peerId: value.peerId, bindingId: value.bindingId, clockId: value.clockId, sequence: value.sequence,
    elapsedNs: value.elapsedNs, framesDecoded: value.framesDecoded, presentedFrames: value.presentedFrames };
}
