# Pixelated Engine Runtime

Local Docker runtime for RetroArch, GStreamer/WebRTC, Socket.IO signaling, local vault storage, and input forwarding.

Build from this folder:

```sh
docker build -t pixelated-engine .
```

Run through the desktop app for normal local use so it can generate and pass the per-run pairing token.

The desktop launcher builds this image locally by default. Packaged releases can
prefer a prebuilt image by setting:

```txt
PIXELATED_ENGINE_IMAGE=ghcr.io/your-org/pixelated-engine:latest
PIXELATED_ENGINE_PULL=1
```

Keep `PIXELATED_ENGINE_BUILD_FALLBACK=1` or leave it unset during development so
the desktop app can fall back to building this folder if a pull fails.

Cloud game starts verify their backend-created session token before booting a ROM. Set `PIXELATED_API_URL` when running the container manually:

```sh
docker run -e PIXELATED_API_URL=http://127.0.0.1:4000 ...
```

The browser asks the API for WebRTC ICE servers before negotiation and forwards
that config to the engine in `start-game`. The Node runtime passes it to
`camera.py` as `PIXELATED_ICE_SERVERS`, and the GStreamer `webrtcbin` sender
uses the configured STUN/TURN servers when creating its answer.

The browser also forwards a stream profile in `start-game`. Node validates the
profile and passes it to `camera.py` as `PIXELATED_STREAM_PROFILE`; the camera
bridge applies it to GStreamer framerate caps and VP8 target bitrate.
