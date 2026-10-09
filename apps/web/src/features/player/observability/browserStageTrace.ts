import { validateBrowserStageTraceConfig } from "./browserStageTraceConfig.ts";
import type { BrowserStageTraceConfig } from "./browserStageTraceConfig.ts";

const boundaries = [
  "render_ready", "capture_begin", "capture_output", "pre_encode_queue_enter",
  "pre_encode_queue_exit", "encode_input", "encode_output", "wire_send",
  "receive", "decode_ready", "presentation_proxy",
] as const;
const lossFields = [
  "offered_frames", "sampled_frames", "unsampled_frames", "frame_capacity_dropped",
  "attempted_events", "retained_events", "event_capacity_dropped",
  "event_invalid_timestamp_dropped", "event_contention_dropped",
  "event_shutdown_dropped", "event_correlation_dropped", "browser_missed_presentations",
] as const;
type StopReason = "completed" | "capacity" | "shutdown" | "source_error";
type Event = { sequence: number; frame_id: string; boundary: string; timestamp_ns: number };
type Frame = { frame_id: string; source_sequence: number; correlation: "exact" };

function createStream(index: number, config: BrowserStageTraceConfig, supported: boolean) {
  return {
    stream_id: `stream-${index}`, epoch_id: `epoch-${index}`, clock_id: `clock-${index}`,
    clock: { source: "browser_performance", unit: "ns", origin: "stream_start",
      resolution_ns: null, synchronization: "none" },
    capabilities: boundaries.map(boundary => ({ boundary,
      state: boundary === "presentation_proxy" && supported ? "supported" : "unavailable",
      reason: boundary === "presentation_proxy" ? (supported ? null : "api_unavailable") : "unsupported_source",
    })),
    sampling: { every_nth_frame: config.every_nth_frame }, limits: { max_frames: config.max_frames, max_events: config.max_events },
    deadline: null, frames: [] as Frame[], events: [] as Event[],
    loss: Object.fromEntries(lossFields.map(field => [field, 0])) as Record<typeof lossFields[number], number>,
    stop_reason: "completed" as StopReason,
  };
}

/** In-memory only. Native metadata and absolute clock origins never enter snapshots. */
export class BrowserStageTraceRecording {
  readonly config: BrowserStageTraceConfig;
  private streams: ReturnType<typeof createStream>[] = [];
  private frameSlots = 0;
  private eventSlots = 0;
  private finished = false;
  private cleanups = new Set<() => void>();

  constructor(config: BrowserStageTraceConfig) {
    this.config = validateBrowserStageTraceConfig(config);
  }

  begin(origin: number, supported: boolean) {
    if (this.finished || this.streams.length === 16 || !Number.isFinite(origin) || origin < 0) return null;
    const stream = createStream(this.streams.length + 1, this.config, supported);
    this.streams.push(stream);
    let closed = !supported;
    let lastPresented: number | null = null;
    let lastNow: number | null = null;
    const stop = (reason: StopReason = "completed") => {
      if (!closed) { closed = true; stream.stop_reason = reason; }
    };
    const observe = (now: number, presentation: number, presented: number) => {
      if (closed || this.finished) return false;
      // A reset closes this scope; a new attachment must establish a fresh origin.
      if (!Number.isFinite(now) || now < origin || (lastNow !== null && now < lastNow)
        || !Number.isSafeInteger(presented) || presented < 0 || presented > 0xffffffff
        || (lastPresented !== null && presented <= lastPresented)
        || stream.loss.offered_frames === 0x7fffffff
        || (lastPresented !== null && !Number.isSafeInteger(stream.loss.browser_missed_presentations + presented - lastPresented - 1))) {
        stop("source_error"); return false;
      }
      if (lastPresented !== null) stream.loss.browser_missed_presentations += presented - lastPresented - 1;
      lastPresented = presented; lastNow = now;
      const sequence = ++stream.loss.offered_frames;
      if ((sequence - 1) % this.config.every_nth_frame !== 0) {
        stream.loss.unsampled_frames++; return true;
      }
      if (this.frameSlots === this.config.max_frames) {
        stream.loss.frame_capacity_dropped++; stop("capacity"); return false;
      }
      this.frameSlots++; stream.loss.sampled_frames++;
      const frame_id = `frame-${sequence}`;
      stream.frames.push({ frame_id, source_sequence: sequence, correlation: "exact" });
      for (const [boundary, timestamp] of [["presentation_proxy", presentation], ["presentation_callback", now]] as const) {
        const eventSequence = ++stream.loss.attempted_events;
        const relative = (timestamp - origin) * 1e6;
        const timestamp_ns = Math.round(relative);
        if (!Number.isFinite(timestamp) || !Number.isFinite(relative) || relative < 0 || !Number.isSafeInteger(timestamp_ns)) {
          stream.loss.event_invalid_timestamp_dropped++;
        } else if (this.eventSlots === this.config.max_events) {
          stream.loss.event_capacity_dropped++;
        } else {
          this.eventSlots++; stream.loss.retained_events++;
          stream.events.push({ sequence: eventSequence, frame_id, boundary, timestamp_ns });
        }
      }
      if (this.eventSlots === this.config.max_events) { stop("capacity"); return false; }
      return true;
    };
    const apiUnavailable = () => {
      if (stream.loss.offered_frames === 0) {
        const capability = stream.capabilities.at(-1)!;
        capability.state = "unavailable"; capability.reason = "api_unavailable";
      }
      stop("source_error");
    };
    return { observe, stop, apiUnavailable };
  }

  registerCleanup(cleanup: () => void) {
    if (this.finished) { cleanup(); return () => {}; }
    this.cleanups.add(cleanup);
    return () => { this.cleanups.delete(cleanup); };
  }

  finish() {
    if (this.finished) return;
    for (const cleanup of [...this.cleanups]) cleanup();
    this.cleanups.clear(); this.finished = true;
  }

  hasLifetimes() {
    return this.streams.length > 0;
  }

  snapshot(producerVersion: string, provenance: "synthetic" | "producer_capture") {
    if (!this.finished || !this.streams.length || typeof producerVersion !== "string" || producerVersion.length !== 40 || !/^[0-9a-f]{40}$/.test(producerVersion)
      || !["synthetic", "producer_capture"].includes(provenance)) {
      throw new Error("N4 browser snapshot requires closed evidence and a producer commit");
    }
    return structuredClone({ schema_version: "stage-trace-record-v1", method_release: "n4-stage-local-v1",
      trace_id: "trace-1", session_id: "session-1", run_id: "run-1", producer: "pixelated_browser",
      producer_version: producerVersion, provenance, streams: this.streams });
  }
}

type FrameVideo = {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { presentationTime: number; presentedFrames: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** One callback outstanding; stop flags also neutralize a callback whose cancellation fails. */
export function attachBrowserStageTrace(video: FrameVideo, recording: BrowserStageTraceRecording, clock = () => performance.now()) {
  const supported = typeof video.requestVideoFrameCallback === "function" && typeof video.cancelVideoFrameCallback === "function";
  let scope: ReturnType<BrowserStageTraceRecording["begin"]> = null;
  try { scope = recording.begin(clock(), supported); } catch { return () => {}; }
  if (!scope || !supported) return () => {};
  let stopped = false;
  let handle: number | null = null;
  let unregister = () => {};
  const stop = (reason: StopReason = "completed") => {
    if (stopped) return;
    stopped = true; scope.stop(reason); unregister();
    if (handle !== null) { try { video.cancelVideoFrameCallback!(handle); } catch { /* Already inactive. */ } }
    handle = null;
  };
  const schedule = () => {
    try { handle = video.requestVideoFrameCallback!((now, metadata) => {
      handle = null;
      if (stopped) return;
      try {
        if (!scope.observe(now, metadata.presentationTime, metadata.presentedFrames)) { stop(); return; }
        schedule();
      } catch { stop("source_error"); }
    }); } catch { scope.apiUnavailable(); stop("source_error"); }
  };
  unregister = recording.registerCleanup(() => stop("shutdown"));
  if (!stopped) schedule();
  return () => stop();
}
