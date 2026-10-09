export type BrowserStageTraceConfig = Readonly<{
  every_nth_frame: number;
  max_frames: number;
  max_events: number;
}>;

export function validateBrowserStageTraceConfig(config: BrowserStageTraceConfig) {
  for (const [value, maximum] of [
    [config.every_nth_frame, 1000],
    [config.max_frames, 2000],
    [config.max_events, 10000],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error("N4 browser trace configuration is outside approved limits");
    }
  }
  return Object.freeze({
    every_nth_frame: config.every_nth_frame,
    max_frames: config.max_frames,
    max_events: config.max_events,
  });
}

export function parseBrowserStageTraceConfig(environment: Record<string, unknown>) {
  const enabled = environment.VITE_N4_STAGE_TRACE === undefined ? "0" : environment.VITE_N4_STAGE_TRACE;
  if (enabled === "0") return null;
  if (enabled !== "1") throw new Error("VITE_N4_STAGE_TRACE must be 0 or 1");
  function number(name: string, fallback: number) {
    const raw = environment[name];
    if (raw === undefined) return fallback;
    if (typeof raw !== "string" || raw.length < 1 || raw.length > 16 || /[^0-9]/.test(raw)) {
      throw new Error("N4 browser trace configuration requires decimal integers");
    }
    return Number(raw);
  }
  return validateBrowserStageTraceConfig({
    every_nth_frame: number("VITE_N4_STAGE_TRACE_EVERY_NTH_FRAME", 1),
    max_frames: number("VITE_N4_STAGE_TRACE_MAX_FRAMES", 2000),
    max_events: number("VITE_N4_STAGE_TRACE_MAX_EVENTS", 10000),
  });
}
