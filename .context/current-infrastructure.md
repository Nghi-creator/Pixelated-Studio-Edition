# Current Infrastructure Snapshot

Last reviewed: 2026-05-26

## Project Shape

PIXELATED Studio is currently a React + Supabase web app paired with a local Electron desktop orchestrator. The desktop app builds and runs a Docker container that hosts the emulator, captures a virtual display, and streams video/audio to the browser over WebRTC.

Top-level areas:

- `web_server/`: Vite, React 19, TypeScript, Tailwind frontend.
- `app_server/`: Electron desktop app, local Express/Socket.IO bridge, Docker image, GStreamer/Python WebRTC sender.
- `services/api/`: localhost-first Fastify + TypeScript backend control-plane skeleton.
- `supabase/`: database, storage, RLS, RPC, and realtime migrations.
- `assets/`: README/banner architecture imagery.

## Backend API

Current status:

- Phase 3 localhost skeleton exists in `services/api/`.
- Default local URL is `http://127.0.0.1:4000`.
- Production API startup defaults to `0.0.0.0` when `NODE_ENV=production` so hosts like Render can detect the open port.
- `GET /` returns a small liveness response for provider root probes.
- `GET /health` returns service name, environment, uptime, and `ok: true`.
- `GET /ready` returns `503` until the required Supabase backend env vars are configured.
- `GET /me` verifies a Supabase bearer token and returns the authenticated user id/email.
- `GET /me/permissions` verifies a Supabase bearer token, reads `profiles`, and returns role/profile data plus a small abilities object.
- `POST /games/:gameId/play-count` increments play count through the API instead of direct browser RPC.
- `POST /moderation/comments/:commentId/report` submits comment reports through the API using the authenticated user id.
- `POST /sessions` creates a short-lived backend session for cloud games, resolves `games.rom_url || games.rom_filename`, and returns the engine boot target to React.
- `POST /local-pairings` records authenticated local-engine pairing intent and endpoint metadata without storing the desktop pairing token.
- `GET /local-pairings/current` and `DELETE /local-pairings/current` expose/clear the current user's local pairing metadata.
- CORS allows local Vite origins and the hosted Vercel origin.
- API CORS origin matching normalizes trailing slashes to avoid deploy config mistakes.
- Supabase anon/service clients are scaffolded and used by auth/permissions routes when API env vars are configured.
- `services/api/.env` exists locally with blank Supabase keys for the project owner to fill.
- On 2026-05-26, the local API passed pre-hosting checks after the project owner filled `services/api/.env`: typecheck, lint, build, `/health`, `/ready`, protected-route 401 behavior, and Vercel-origin CORS.
- `web_server/src/lib/apiClient.ts` calls the API with the current Supabase access token.
- Cloud/library game boot, player play-count tracking, and comment reporting now depend on the API.

## Web App

Runtime stack:

- Vite + React + TypeScript.
- `@supabase/supabase-js` for auth, database, storage, realtime, and RPC calls.
- `socket.io-client` connects directly to the local engine at `http://localhost:8080`.
- The web app centralizes the engine base URL in `web_server/src/lib/engineConfig.ts`; override with `VITE_ENGINE_URL`.
- Routes are declared in `web_server/src/App.tsx`.

Main user-facing routes:

- `/`: cloud game library.
- `/play/:id`: WebRTC player plus reactions/comments.
- `/local`: local vault for uploaded `.nes` files on the local engine.
- `/favorites`, `/profile`, `/publish`, `/login`, `/reset-password`.

Admin routes:

- `/admin`: moderation queue.
- `/admin/users`: user management.
- `/admin/logs`: access logs.

Current important frontend behaviors:

- `useWebRTC` owns React stream/status lifecycle while helper modules resolve game boot targets, create WebRTC peer connections, and forward keyboard input.
- For cloud/library games, `useWebRTC` asks the backend API to create a session and resolve the ROM target before emitting `start-game` to the local engine.
- The prompt-only engine token flow has been replaced by a local engine pairing panel in the player and Local Vault UI.
- The desktop pairing token remains browser-local in `localStorage`; the backend only receives the engine URL/intent metadata.
- `useWebRTC` reconnects when the pairing state changes, so pairing from the player page can immediately retry stream startup.
- `/play/:id` is composed from `web_server/src/features/player/` hooks/components for stream display, telemetry, metadata, reactions, comments, reporting, and play-count tracking.
- Local vault uploads/deletes ROMs by calling the local engine with `X-User-Id` and `X-Engine-Token` headers.
- Publishing uploads ROM/images directly from the browser to Supabase Storage bucket `submissions`, inserts metadata into `game_submissions`, then pings Formspree.
- Session tracking inserts browser-load access logs directly from the client.

## Desktop Orchestrator

Runtime stack:

- Electron app in `app_server/main.js`.
- Renderer files: `app_server/index.html` and `app_server/preload.js`.
- Uses local Docker CLI through `child_process.exec`.

Current lifecycle:

1. User clicks initialize in the Electron UI.
2. Electron checks `docker info`.
3. Electron builds local image `pixelated-engine` from `app_server/Dockerfile`.
4. Electron generates a random pairing token for this engine run.
5. Electron displays the pairing token in the desktop UI.
6. Electron removes any stale `pixelated-node` container.
7. Electron runs a detached container named `pixelated-node` with `-p 127.0.0.1:8080:8080` and `-v pixelated-roms:/roms`, publishing the engine only to host loopback, and passes `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"`, `PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co"`, plus `PIXELATED_ENGINE_TOKEN`.
8. Electron polls `http://127.0.0.1:8080/health` and only marks the engine successful after it returns `ok: true`.
9. On stop/window close, Electron removes `pixelated-node`.

Notable constraints:

- Container name and port are fixed.
- Build happens on user machine from the distributed app folder.
- Health verifies core local engine dependencies: Xvfb, PulseAudio startup, RetroArch binary/config/core, Python/GStreamer bridge presence, and `/roms` writability.

## Engine Container

Image base:

- `ubuntu:22.04`.

Installed runtime pieces:

- Xvfb virtual display.
- PulseAudio.
- GStreamer and WebRTC-related plugins.
- Python 3 with `python-socketio[client]`.
- RetroArch.
- Mesen libretro core compiled from source during Docker build.
- Node.js 20.
- Express, Socket.IO, CORS, Multer.

Runtime processes:

- `server.js`: Express + Socket.IO composition root.
- `app_server/src/`: local engine modules for config, health/local vault HTTP routes, Socket.IO signaling, ROM download/storage, runtime process control, input injection, and health telemetry.
- `Xvfb :99`: virtual screen.
- PulseAudio system daemon.
- RetroArch process per game.
- `camera.py`: GStreamer `webrtcbin` sender for X11 capture and PulseAudio monitor.

Data paths:

- Local uploaded ROMs are stored under `/roms/<userId>/`, backed by the named Docker volume `pixelated-roms`.
- Cloud ROM URLs are downloaded into `/tmp/cloud_game_<uuid>.nes` after HTTPS, host allowlist, size, and timeout validation. The active temp cloud ROM is deleted on session cleanup or when a new game replaces it.

Streaming/signaling:

- `GET /health` is exposed for Electron readiness checks and returns structured subsystem state.
- Browser connects to Node Socket.IO at `localhost:8080`.
- Node forwards WebRTC offers, answers, and ICE candidates between browser and Python sender inside a Socket.IO room named `session:<id>`.
- Python connects back to Node at `http://localhost:8080`.
- Browser receives VP8 video and Opus audio.
- React generates the current session id, Node passes it into `camera.py` through `PIXELATED_SESSION_ID`, and both browser/camera sockets join the same room before WebRTC negotiation.
- React polls browser WebRTC stats once per second for FPS, bitrate, ICE state, packet loss, and jitter. The player hides those metrics by default and exposes them through a persisted developer telemetry toggle.
- Engine-side download failures and camera/GStreamer failures emit `engine-error` to the browser session.

Input:

- Browser keydown/keyup events are attached by `web_server/src/lib/webrtcInput.ts` and go through Socket.IO.
- Node maps browser keys to X11 key names.
- Node executes `xdotool keydown/keyup` against display `:99`.
- React emits `stop-session` during player cleanup; Node stops the active emulator/camera processes and removes the active temp cloud ROM.

## Supabase

Used as the only hosted backend today:

- Auth.
- Postgres tables.
- Storage buckets.
- Realtime publication.
- RPC functions.
- Row Level Security policies.

Core tables inferred from migrations:

- `games`: library metadata, ROM filename/url, cover/backdrop/banner, play count, author/dev metadata.
- `profiles`: auth-linked profile, username, email, avatar, role, ban flag.
- `favorites`: user-game join table.
- `likes`, `comments`, `comment_likes`: social reactions and comments.
- `reported_comments`: moderation queue.
- `access_logs`: page/session logging.
- `game_submissions`: developer upload applications.

Storage buckets inferred from migrations:

- `avatars`: public avatar images.
- `default_library`: public library ROM/media assets.
- `submissions`: public developer submission upload target.
- `web_roms`: private user ROM bucket from a migration, but the current local vault code uses the local Docker engine instead.

Security model today:

- Most app data access happens directly from the browser with the Supabase anon client and RLS.
- Admin pages rely on client-side role checks for routing, while database policies appear to provide the real enforcement.
- Local engine HTTP routes and Socket.IO handshakes require the per-run pairing token generated by Electron.
- The hosted React app stores the pairing token in browser `localStorage` and sends it through `X-Engine-Token` for REST calls and Socket.IO auth for streaming.
- The Python camera bridge receives `PIXELATED_ENGINE_TOKEN` through env and uses it when connecting to Node Socket.IO.
- The Docker port is published only to host loopback and the engine CORS origin is set to the hosted Vercel app by Electron.
- Local vault uploads are limited to `.nes` filenames and capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.

## Deployment Model

Current likely deployment:

- Web frontend hosted on Vercel or similar static hosting.
- Supabase hosted project.
- Local Electron app distributed as `.dmg`, `.exe`, and `.AppImage`.
- Docker engine runs locally on the user's host.
- Browser connects to `localhost:8080`, so the cloud web app depends on a local desktop engine for streaming.

This is closer to a hybrid local cloud-gaming node than a fully hosted cloud-gaming service. That is a valid architecture for developer self-hosting, but it has different scaling needs than a centralized cloud fleet.
