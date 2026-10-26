/** Serialized into the disposable page; identical measurement overhead in on/off cases. */
export async function collectBrowserQuality(pc, video, durationMs = 4000) {
  if (durationMs !== 4000 || pc.connectionState !== "connected" || !video.requestVideoFrameCallback) throw new Error("quality screen unavailable");
  const start = performance.now();
  const frames = [], stats = [], visuals = [];
  let frameId, busy = false, failure = null, closed = false, identity = null;
  const canvas = globalThis.document.createElement("canvas"); canvas.width = 80; canvas.height = 60;
  const pixels = canvas.getContext("2d", { willReadFrequently: true });
  const now = () => performance.now() - start;
  function frame(_stamp, item) {
    if (closed) return;
    frames.push({ at_ms: now(), pts_ms: item.mediaTime * 1000, presented: item.presentedFrames, width: item.width, height: item.height });
    if (frames.length > 300) { failure = "frame budget"; return; }
    frameId = video.requestVideoFrameCallback(frame);
  }
  async function sample() {
    if (busy || closed) return;
    busy = true;
    try {
      const readStart = now();
      const values = [...(await pc.getStats()).values()].filter((s) => s.type === "inbound-rtp" && s.kind === "video");
      if (closed) return;
      if (values.length !== 1 || now() - readStart > 500) throw new Error("missing/slow inbound stats");
      const s = values[0], key = JSON.stringify([s.id, s.ssrc, s.trackIdentifier]);
      if (identity !== null && identity !== key) throw new Error("stats identity changed");
      identity = key;
      stats.push({ at_ms: now(), decoded: s.framesDecoded, dropped: s.framesDropped, freezes: s.freezeCount,
        width: s.frameWidth, height: s.frameHeight });
      if (stats.length > 32) throw new Error("stats budget");
    } catch (error) { failure = String(error); }
    finally { busy = false; }
  }
  function visual() {
    if (!pixels || video.readyState < 2 || video.videoWidth !== 640 || video.videoHeight !== 480) { failure = "visual unavailable"; return; }
    pixels.drawImage(video, 0, 0, 80, 60);
    const data = pixels.getImageData(0, 0, 80, 60).data;
    const colors = new Set(); let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i] >> 5) * 64 + (data[i + 1] >> 5) * 8 + (data[i + 2] >> 5));
      for (let k = 0; k < 3; k++) hash = Math.imul(hash ^ data[i + k], 16777619);
    }
    visuals.push({ at_ms: now(), color_bins: colors.size, hash: hash >>> 0 });
    if (visuals.length > 16) failure = "visual budget";
  }
  let statsTimer, visualTimer;
  try {
    frameId = video.requestVideoFrameCallback(frame);
    await sample(); visual();
    statsTimer = setInterval(sample, 200); visualTimer = setInterval(visual, 500);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    // Stop periodic queries before waiting on a final bounded query.
    clearInterval(statsTimer); clearInterval(visualTimer);
    const drainDeadline = performance.now() + 500;
    while (busy && performance.now() < drainDeadline) await new Promise((resolve) => setTimeout(resolve, 5));
    if (busy) failure = "stats still pending at window end";
    else await sample();
    visual();
    return { basis: "browser_performance_relative_ms", duration_ms: now(), frames, stats, visuals, failure,
      connection_state: pc.connectionState };
  } finally {
    closed = true; clearInterval(statsTimer); clearInterval(visualTimer);
    if (frameId !== undefined) video.cancelVideoFrameCallback(frameId);
  }
}
