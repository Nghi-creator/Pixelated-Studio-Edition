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
