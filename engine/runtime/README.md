# Pixelated Engine Runtime

Local Docker runtime for RetroArch, GStreamer/WebRTC, Socket.IO signaling, local vault storage, and input forwarding.

Build from this folder:

```sh
docker build -t pixelated-engine .
```

The runtime now compiles mixed TypeScript/JavaScript source into `dist/` before
starting:

```sh
npm run build
npm run check
npm test
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

## Native Debian runtime

The native proof-of-concept image is built separately from the libretro image.
It installs only the pinned Debian `main` packages listed in
`native-runtime.lock.json`, embeds that same lock file at
`/app/native-runtime.lock.json`, and launches games through engine-owned
manifests instead of database-supplied commands.

```sh
npm run build:native
npm run smoke:native
```

`npm run build:native` tags the image from the lock hash, for example
`pixelated-engine-native:debian-native-v1-46d11e8650c8`, and writes the runtime
ID plus lock SHA-256 into image labels. `npm run smoke:native` defaults to that
same versioned tag, then verifies the embedded lock file checksum, executable
paths, Xvfb boot, and headless SDL audio for every package in the lock manifest.

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
