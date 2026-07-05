# Pixelated Engine Runtime

Token-gated local runtime that runs inside Docker. It owns the local engine API, Socket.IO signaling, emulator process lifecycle, Local Vault storage, WebRTC relay, input forwarding, telemetry routes, and optional native Linux game launch.

Normal users should start this through `apps/desktop`; the desktop app generates the per-run token, chooses local or LAN exposure, starts the container, and configures the HTTPS companion.

## Runtime pieces

- Express HTTP routes for health, local vault, session control, display frames, and smoke telemetry.
- Socket.IO signaling for WebRTC offer/answer/ICE, engine events, lobby state, and input.
- RetroArch/libretro launch path for `.nes` catalog and Local Vault games.
- Optional native Linux launch path using engine-owned manifests.
- Xvfb, PulseAudio, GStreamer, and Python camera bridge for VP8/Opus WebRTC streaming.
- Docker volume `pixelated-roms` for Local Vault files.
- Backend session verification before cloud ROM boot.
- Revoked browser client/access identity enforcement.

## Code map

```text
src/http/        Express routes and HTTP error handling
src/signaling/   Socket.IO auth, start-game, lobby, input, relay handlers
src/runtime/     Runtime registry, process lifecycle, native/libretro launch
src/roms/        Cloud ROM download and local vault storage
src/input/       Browser key/gamepad translation and injection
src/telemetry/   Health/resource snapshots
tests/           Unit coverage by runtime area
camera.py        GStreamer WebRTC sender
server.ts        Runtime process entry point
```

## Local commands

```sh
npm install
npm run build
npm run check
npm test
```

Build the default libretro Docker image:

```sh
docker build -t pixelated-engine .
```

Run manually only for low-level runtime work. For app development, prefer the desktop app.

## Cloud game boot

Cloud sessions are approved by `services/api` before the engine boots a catalog target:

1. Web opens `/play/:gameId`.
2. Web asks the API to create a cloud session.
3. Web sends `start-game` to the local engine with the session id/token and backend-approved boot metadata.
4. Engine verifies the session with the API.
5. Engine downloads the approved HTTPS ROM target when needed and boots the runtime.

Set the API URL when running manually:

```txt
PIXELATED_API_URL=http://127.0.0.1:4000
```

## WebRTC and stream profiles

The browser asks the API for ICE servers before negotiation and forwards that config in `start-game`. The Node runtime passes it to `camera.py` as:

```txt
PIXELATED_ICE_SERVERS=<json>
```

The browser also forwards a stream profile. Node validates it and passes it to the camera bridge as:

```txt
PIXELATED_STREAM_PROFILE=<json>
```

The camera bridge applies the profile to GStreamer framerate caps and VP8 target bitrate.

## Native Debian runtime

The native proof-of-concept image is separate from the libretro image. It installs only the pinned Debian `main` packages listed in `native-runtime.lock.json`, embeds that lock file at `/app/native-runtime.lock.json`, and launches games through engine-owned manifests instead of database-supplied commands.

```sh
npm run build:native
npm run smoke:native
```

`npm run build:native` tags the image from the lock hash, for example:

```txt
pixelated-engine-native:debian-native-v1-46d11e8650c8
```

`npm run smoke:native` verifies the embedded lock checksum, executable paths, Xvfb boot, and headless SDL audio for every package in the lock manifest.

## Desktop image controls

The desktop launcher builds this folder locally by default. Packaged releases can prefer a prebuilt image:

```txt
PIXELATED_ENGINE_IMAGE=ghcr.io/your-org/pixelated-engine:latest
PIXELATED_ENGINE_PULL=1
PIXELATED_ENGINE_BUILD_FALLBACK=1
```

Native runtime override:

```txt
PIXELATED_ENGINE_RUNTIME_KIND=native_linux
PIXELATED_ENGINE_NATIVE_IMAGE=pixelated-engine-native:debian-native-v1-...
```
