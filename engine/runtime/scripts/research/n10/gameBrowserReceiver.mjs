// Serialized by Playwright into a fresh, owned about:blank page only.
export function installReceiver() {
  const send = (value) => globalThis.signalWorker(value);
  const peer = new globalThis.RTCPeerConnection({ iceServers: [] });
  const video = globalThis.document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.width = 640;
  video.height = 480;
  globalThis.document.body.append(video);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 60;
  const pixels = canvas.getContext("2d", { willReadFrequently: true });
  const pending = [];
  let count = 0, statsBusy = false;
  const browserNow = () => Math.round(globalThis.performance.now() * 1e6);
  peer.onicecandidate = (event) => {
    if (event.candidate) void send({ type: "ice", index: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate });
  };
  peer.onconnectionstatechange = () => { void send({ type: "health", state: peer.connectionState }); };
  function frame(_now, item) {
    if (++count > 1200) { peer.close(); return; }
    void send({ type: "frame", pts_ns: Math.round(item.mediaTime * 1e9),
      browser_at_ns: browserNow(), presented_frames: item.presentedFrames,
      width: item.width, height: item.height });
    video.requestVideoFrameCallback(frame);
  }
  peer.ontrack = (event) => {
    video.srcObject = event.streams[0] || new globalThis.MediaStream([event.track]);
    video.requestVideoFrameCallback(frame);
    void video.play();
  };
  const statsTimer = globalThis.setInterval(async () => {
    if (statsBusy || peer.connectionState !== "connected") return;
    statsBusy = true;
    try {
      const stats = await peer.getStats();
      for (const item of stats.values()) {
        if (item.type !== "inbound-rtp" || item.kind !== "video") continue;
        const values = {};
        for (const key of ["framesReceived", "framesDecoded", "framesDropped", "freezeCount",
          "totalFreezesDuration", "totalDecodeTime", "jitterBufferDelay", "jitterBufferEmittedCount",
          "frameWidth", "frameHeight", "keyFramesDecoded", "packetsLost", "bytesReceived"])
          values[key] = typeof item[key] === "number" && Number.isFinite(item[key]) ? item[key] : null;
        await send({ type: "stats", browser_at_ns: browserNow(), values });
      }
    } finally { statsBusy = false; }
  }, 200);
  const visualTimer = globalThis.setInterval(() => {
    if (!video.videoWidth || video.readyState < 2) return;
    pixels.drawImage(video, 0, 0, 80, 60);
    const data = pixels.getImageData(0, 0, 80, 60).data;
    let hash = 2166136261;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 4) {
      colors.add((data[index] >> 5) * 64 + (data[index + 1] >> 5) * 8 + (data[index + 2] >> 5));
      for (let channel = 0; channel < 3; channel++) hash = Math.imul(hash ^ data[index + channel], 16777619);
    }
    void send({ type: "visual", browser_at_ns: browserNow(), hash: hash >>> 0, color_bins: colors.size });
  }, 500);
  globalThis.receiveWorker = async (message) => {
    if (message.type === "offer") {
      await peer.setRemoteDescription({ type: "offer", sdp: message.sdp });
      for (const candidate of pending) await peer.addIceCandidate(candidate);
      pending.length = 0;
      await peer.setLocalDescription(await peer.createAnswer());
      await send({ type: "answer", sdp: peer.localDescription.sdp });
    } else if (message.type === "ice") {
      const candidate = { candidate: message.candidate, sdpMLineIndex: message.index };
      if (peer.remoteDescription) await peer.addIceCandidate(candidate);
      else {
        if (pending.length >= 32) throw new Error("candidate limit");
        pending.push(candidate);
      }
    } else if (message.type === "disconnect") {
      peer.close();
      await send({ type: "health", state: "closed" });
    } else throw new Error("unsupported worker message");
  };
  globalThis.stopReceiver = () => {
    globalThis.clearInterval(statsTimer);
    globalThis.clearInterval(visualTimer);
    peer.close();
    video.srcObject = null;
  };
}
