/** Bounded RVFC trace spanning setters/restoration; no cross-clock alignment. */
export function startControlContinuity(pc, video) {
  if (pc.connectionState !== "connected" || !video.requestVideoFrameCallback) throw new Error("control continuity unavailable");
  const start = performance.now();
  const frames = [];
  let frameId, closed = false, failure = null, result;
  function frame(_stamp, item) {
    if (closed) return;
    if (frames.length >= 2048 || performance.now() - start > 26000) { failure = "control continuity budget"; return; }
    frames.push({ at_ms: performance.now() - start, pts_ms: item.mediaTime * 1000,
      presented: item.presentedFrames, width: item.width, height: item.height });
    frameId = video.requestVideoFrameCallback(frame);
  }
  frameId = video.requestVideoFrameCallback(frame);
  return function stop() {
    if (result) return result;
    closed = true;
    video.cancelVideoFrameCallback(frameId);
    result = { basis: "browser_performance_relative_ms", duration_ms: performance.now() - start,
      frames, failure };
    return result;
  };
}
