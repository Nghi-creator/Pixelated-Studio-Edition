export type ParsedWebRTCStats = {
  availableIncomingBitrateKbps: number | null;
  bitrateKbps: number | null;
  decodeTimeMeanMs: number | null;
  fps: number | null;
  framesDecoded: number | null;
  framesDropped: number | null;
  freezeCount: number | null;
  freezeDurationTotalMs: number | null;
  jitterBufferDelayMeanMs: number | null;
  jitterMs: number | null;
  keyFramesDecoded: number | null;
  packetsLost: number;
  roundTripTimeMs: number | null;
};

export type WebRTCStatsRecord = {
  [key: string]: unknown;
  id: string;
  timestamp: number;
  type: string;
};

type InboundCounterSnapshot = {
  bytesReceived: number | null;
  framesDecoded: number | null;
  jitterBufferDelay: number | null;
  jitterBufferEmittedCount: number | null;
  timestamp: number | null;
  totalDecodeTime: number | null;
};

export type WebRTCStatsParserState = {
  inboundById: Record<string, InboundCounterSnapshot>;
};

export function createWebRTCStatsParserState(): WebRTCStatsParserState {
  return { inboundById: {} };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function sumNullable(values: Array<number | null>) {
  const supported = values.filter((value): value is number => value !== null);
  return supported.length > 0
    ? supported.reduce((total, value) => total + value, 0)
    : null;
}

function counterDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null || current < previous) return null;
  return current - previous;
}

function selectedCandidatePair(records: WebRTCStatsRecord[]) {
  const selectedPairIds = records
    .filter((record) => record.type === "transport")
    .map((record) => record.selectedCandidatePairId)
    .filter((value): value is string => typeof value === "string");
  const pairs = records.filter((record) => record.type === "candidate-pair");

  return (
    pairs.find((pair) => selectedPairIds.includes(pair.id)) ||
    pairs.find((pair) => pair.selected === true) ||
    pairs.find((pair) => pair.nominated === true && pair.state === "succeeded") ||
    null
  );
}

export function parseWebRTCStats(
  reports: Iterable<WebRTCStatsRecord>,
  previousState: WebRTCStatsParserState,
): { metrics: ParsedWebRTCStats; state: WebRTCStatsParserState } {
  const records = Array.from(reports);
  const inbound = records.filter((record) => record.type === "inbound-rtp");
  const videoInbound = inbound.filter(
    (record) => (record.kind || record.mediaType) === "video",
  );
  const nextInboundById: Record<string, InboundCounterSnapshot> = {};
  const bitrateRates: number[] = [];
  let everyByteCounterHasDelta = true;

  inbound.forEach((record) => {
    const current: InboundCounterSnapshot = {
      bytesReceived: nonNegativeNumber(record.bytesReceived),
      framesDecoded: nonNegativeNumber(record.framesDecoded),
      jitterBufferDelay: nonNegativeNumber(record.jitterBufferDelay),
      jitterBufferEmittedCount: nonNegativeNumber(
        record.jitterBufferEmittedCount,
      ),
      timestamp: nonNegativeNumber(record.timestamp),
      totalDecodeTime: nonNegativeNumber(record.totalDecodeTime),
    };
    nextInboundById[record.id] = current;

    if (current.bytesReceived === null) return;
    const previous = previousState.inboundById[record.id];
    const bytesDelta = counterDelta(
      current.bytesReceived,
      previous?.bytesReceived ?? null,
    );
    const timestampDelta = counterDelta(
      current.timestamp,
      previous?.timestamp ?? null,
    );
    if (bytesDelta === null || timestampDelta === null || timestampDelta <= 0) {
      everyByteCounterHasDelta = false;
      return;
    }
    bitrateRates.push((bytesDelta * 8) / (timestampDelta / 1000) / 1000);
  });

  let decodeTimeDeltaSeconds = 0;
  let decodedFrameDelta = 0;
  let hasDecodeDelta = false;
  let jitterBufferDelayDeltaSeconds = 0;
  let jitterBufferEmittedDelta = 0;
  let hasJitterBufferDelta = false;

  videoInbound.forEach((record) => {
    const current = nextInboundById[record.id];
    const previous = previousState.inboundById[record.id];
    if (!previous) return;

    const decodeTimeDelta = counterDelta(
      current.totalDecodeTime,
      previous.totalDecodeTime,
    );
    const framesDelta = counterDelta(
      current.framesDecoded,
      previous.framesDecoded,
    );
    if (decodeTimeDelta !== null && framesDelta !== null && framesDelta > 0) {
      decodeTimeDeltaSeconds += decodeTimeDelta;
      decodedFrameDelta += framesDelta;
      hasDecodeDelta = true;
    }

    const bufferDelayDelta = counterDelta(
      current.jitterBufferDelay,
      previous.jitterBufferDelay,
    );
    const emittedDelta = counterDelta(
      current.jitterBufferEmittedCount,
      previous.jitterBufferEmittedCount,
    );
    if (bufferDelayDelta !== null && emittedDelta !== null && emittedDelta > 0) {
      jitterBufferDelayDeltaSeconds += bufferDelayDelta;
      jitterBufferEmittedDelta += emittedDelta;
      hasJitterBufferDelta = true;
    }
  });

  const candidatePair = selectedCandidatePair(records);
  const roundTripTimeSeconds = candidatePair
    ? nonNegativeNumber(candidatePair.currentRoundTripTime)
    : null;
  const availableIncomingBitrate = candidatePair
    ? nonNegativeNumber(candidatePair.availableIncomingBitrate)
    : null;
  const jitterValues = inbound
    .map((record) => nonNegativeNumber(record.jitter))
    .filter((value): value is number => value !== null);
  const fpsValues = videoInbound
    .map((record) => nonNegativeNumber(record.framesPerSecond))
    .filter((value): value is number => value !== null);

  return {
    metrics: {
      availableIncomingBitrateKbps:
        availableIncomingBitrate === null
          ? null
          : availableIncomingBitrate / 1000,
      bitrateKbps:
        everyByteCounterHasDelta && bitrateRates.length > 0
          ? bitrateRates.reduce((total, rate) => total + rate, 0)
          : null,
      decodeTimeMeanMs:
        hasDecodeDelta && decodedFrameDelta > 0
          ? (decodeTimeDeltaSeconds / decodedFrameDelta) * 1000
          : null,
      fps: fpsValues.length > 0 ? Math.max(...fpsValues) : null,
      framesDecoded: sumNullable(
        videoInbound.map((record) => nonNegativeNumber(record.framesDecoded)),
      ),
      framesDropped: sumNullable(
        videoInbound.map((record) => nonNegativeNumber(record.framesDropped)),
      ),
      freezeCount: sumNullable(
        videoInbound.map((record) => nonNegativeNumber(record.freezeCount)),
      ),
      freezeDurationTotalMs: (() => {
        const seconds = sumNullable(
          videoInbound.map((record) =>
            nonNegativeNumber(record.totalFreezesDuration),
          ),
        );
        return seconds === null ? null : seconds * 1000;
      })(),
      jitterBufferDelayMeanMs:
        hasJitterBufferDelta && jitterBufferEmittedDelta > 0
          ? (jitterBufferDelayDeltaSeconds / jitterBufferEmittedDelta) * 1000
          : null,
      jitterMs:
        jitterValues.length > 0 ? Math.max(...jitterValues) * 1000 : null,
      keyFramesDecoded: sumNullable(
        videoInbound.map((record) =>
          nonNegativeNumber(record.keyFramesDecoded),
        ),
      ),
      packetsLost: Math.max(
        0,
        Math.round(
          inbound.reduce(
            (total, record) =>
              total + (nonNegativeNumber(record.packetsLost) ?? 0),
            0,
          ),
        ),
      ),
      roundTripTimeMs:
        roundTripTimeSeconds === null ? null : roundTripTimeSeconds * 1000,
    },
    state: { inboundById: nextInboundById },
  };
}
