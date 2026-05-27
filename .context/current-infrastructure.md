# Current Infrastructure Snapshot

Last reviewed: 2026-05-27

## Project Shape

PIXELATED Studio is currently a React + Supabase web app paired with a local Electron desktop orchestrator. The desktop app builds and runs a Docker container that hosts the emulator, captures a virtual display, and streams video/audio to the browser over WebRTC.

Top-level areas:

- `apps/web/`: Vite, React 19, TypeScript, Tailwind frontend.
- `apps/desktop/`: Electron desktop launcher and Docker orchestration UI.
- `engine/runtime/`: local Express/Socket.IO bridge, Docker image, RetroArch/GStreamer runtime, and Python WebRTC sender.
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
- `POST /admin/reports/:reportId/action` resolves moderation queue actions through the API for ignore, delete-comment, and ban-user actions.
- `GET /admin/reports` loads the moderation queue through the API for authenticated admins/super admins.
- `POST /submissions/games` creates developer game submission records through the API for authenticated users.
- `POST /access-logs` records guest or authenticated session/access logs through the API.
- `POST /sessions` creates a short-lived backend session for cloud games, persists a hashed session token in Supabase, resolves `games.rom_url || games.rom_filename`, and returns the engine boot target to React.
- `POST /sessions/:sessionId/verify` verifies a short-lived session token and returns the backend-approved boot target to the local engine.
- `POST /local-pairings` persists authenticated local-engine pairing intent and endpoint metadata without storing the desktop pairing token.
- `GET /local-pairings/current` and `DELETE /local-pairings/current` expose/clear the current user's local pairing metadata.
- `POST /metrics/stream` persists authenticated, sampled WebRTC telemetry snapshots.
- `GET /metrics/stream/recent` returns recent persisted telemetry snapshots for the authenticated user.
- The API schedules control-plane retention cleanup on startup.
- Cleanup deletes expired/stopped backend sessions and stream metrics older than `STREAM_METRIC_RETENTION_DAYS`.
- CORS allows local Vite origins and the hosted Vercel origin.
- API CORS origin matching normalizes trailing slashes to avoid deploy config mistakes.
- Supabase anon/service clients are scaffolded and used by auth/permissions routes when API env vars are configured.
- `services/api/.env` exists locally and is ignored; production keys live on the backend host.
- API cleanup cadence is controlled by `CONTROL_PLANE_CLEANUP_INTERVAL_MS`, defaulting to one hour.
- `services/api` has a focused `npm run test` suite for persisted sessions, local pairings, stream metrics, and cleanup behavior.
- On 2026-05-26, the local API passed pre-hosting checks after the project owner filled `services/api/.env`: typecheck, lint, build, `/health`, `/ready`, protected-route 401 behavior, and Vercel-origin CORS.
- `apps/web/src/lib/apiClient.ts` calls the API with the current Supabase access token.
- Cloud/library game boot, player play-count tracking, and comment reporting now depend on the API.
- Admin report queue reads and resolution actions now depend on the API instead of direct browser Supabase access.

## Web App

Runtime stack:

- Vite + React + TypeScript.
- `@supabase/supabase-js` for auth, database, storage, realtime, and RPC calls.
- `socket.io-client` connects directly to the local engine at `http://localhost:8080`.
- The web app centralizes the engine base URL in `apps/web/src/lib/engineConfig.ts`; override with `VITE_ENGINE_URL`.
- Routes are declared in `apps/web/src/App.tsx`.

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
- For cloud/library games, `useWebRTC` asks the backend API to create a session before emitting `start-game` with `mode: "cloud"` and the backend `sessionToken` to the local engine.
- The prompt-only engine token flow has been replaced by a local engine pairing panel in the player and Local Vault UI.
- The desktop pairing token remains browser-local in `localStorage`; the backend only receives the engine URL/intent metadata.
- `useWebRTC` reconnects when the pairing state changes, so pairing from the player page can immediately retry stream startup.
- `useWebRTC` sends sampled telemetry to the API every five seconds when authenticated; telemetry remains visible in the developer toggle.
- `/play/:id` is composed from `apps/web/src/features/player/` hooks/components for stream display, telemetry, metadata, reactions, comments, reporting, and play-count tracking.
- Local vault uploads/deletes ROMs by calling the local engine with `X-User-Id` and `X-Engine-Token` headers.
- Publishing requires a signed-in user, uploads ROM/images directly from the browser to Supabase Storage bucket `submissions`, creates submission metadata through the API, then pings Formspree.
- Session tracking calls the API to insert browser-load access logs; the backend derives user id from the optional Supabase bearer token.

## Desktop Orchestrator

Runtime stack:

- Electron app in `apps/desktop/main.js`.
- Renderer files: `apps/desktop/index.html` and `apps/desktop/preload.js`.
- Uses local Docker CLI through `child_process.exec`.

Current lifecycle:

1. User clicks initialize in the Electron UI.
2. Electron checks `docker info`.
3. Electron builds local image `pixelated-engine` from `engine/runtime/Dockerfile`.
4. Electron generates a random pairing token for this engine run.
5. Electron displays the pairing token in the desktop UI.
6. Electron removes any stale `pixelated-node` container.
7. Electron runs a detached container named `pixelated-node` with `-p 127.0.0.1:8080:8080` and `-v pixelated-roms:/roms`, publishing the engine only to host loopback, and passes `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"`, `PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co"`, `PIXELATED_API_URL`, plus `PIXELATED_ENGINE_TOKEN`.
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
- `engine/runtime/src/`: local engine modules for config, health/local vault HTTP routes, Socket.IO signaling, ROM download/storage, runtime process control, input injection, and health telemetry.
- `Xvfb :99`: virtual screen.
- PulseAudio system daemon.
- RetroArch process per game.
- `camera.py`: GStreamer `webrtcbin` sender for X11 capture and PulseAudio monitor.

Data paths:

- Local uploaded ROMs are stored under `/roms/<userId>/`, backed by the named Docker volume `pixelated-roms`.
- Cloud ROM URLs are downloaded into `/tmp/cloud_game_<uuid>.nes` after HTTPS, host allowlist, size, and timeout validation. The active temp cloud ROM is deleted on session cleanup or when a new game replaces it.
- Cloud game starts must include `mode: "cloud"` and the backend `sessionToken`; the engine verifies the token through `PIXELATED_API_URL`, requires the verified backend session mode to be `cloud`, and only then uses the backend-approved boot target.

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

- Browser keydown/keyup events are attached by `apps/web/src/lib/webrtcInput.ts` and go through Socket.IO.
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
- `backend_sessions`: backend-owned playable session records with hashed session tokens and approved boot targets.
- `local_engine_pairings`: backend-owned local engine pairing intent metadata without desktop pairing secrets.
- `stream_metrics`: sampled WebRTC telemetry for authenticated user sessions.

Storage buckets inferred from migrations:

- `avatars`: public avatar images.
- `default_library`: public library ROM/media assets.
- `submissions`: public developer submission upload target.
- `web_roms`: private user ROM bucket from a migration, but the current local vault code uses the local Docker engine instead.

Security model today:

- Most app data access happens directly from the browser with the Supabase anon client and RLS.
- Admin pages rely on client-side role checks for routing, while database policies appear to provide the real enforcement.
- Local engine HTTP routes and Socket.IO handshakes require the per-run pairing token generated by Electron.
- Cloud game boot also requires backend-created session intent: `mode: "cloud"` plus a session token that the engine verifies with the API before downloading or booting the approved ROM target.
- The hosted React app stores the pairing token in browser `localStorage` and sends it through `X-Engine-Token` for REST calls and Socket.IO auth for streaming.
- The Python camera bridge receives `PIXELATED_ENGINE_TOKEN` through env and uses it when connecting to Node Socket.IO.
- The Docker port is published only to host loopback and the engine CORS origin is set to the hosted Vercel app by Electron.
- Local vault uploads are limited to `.nes` filenames and capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.
- Developer submission storage uploads now require an authenticated Supabase user, and `game_submissions.submitter_id` records who submitted the game.
- Direct public inserts into `access_logs` are disabled; access logs are created by the backend service-role client.

## Deployment Model

Current likely deployment:

- Web frontend hosted on Vercel or similar static hosting.
- Supabase hosted project.
- Local Electron app distributed as `.dmg`, `.exe`, and `.AppImage`.
- Docker engine runs locally on the user's host.
- Browser connects to `localhost:8080`, so the cloud web app depends on a local desktop engine for streaming.

This is closer to a hybrid local cloud-gaming node than a fully hosted cloud-gaming service. That is a valid architecture for developer self-hosting, but it has different scaling needs than a centralized cloud fleet.
