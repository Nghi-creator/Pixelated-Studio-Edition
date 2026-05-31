# Current Infrastructure Snapshot

Last reviewed: 2026-05-31

## Project Shape

PIXELATED Studio is currently a React + Supabase web app paired with a local Electron desktop orchestrator. The desktop app builds and runs a Docker container that hosts the emulator, captures a virtual display, and streams video/audio to the browser over WebRTC.

Top-level areas:

- `apps/web/`: Vite, React 19, TypeScript, Tailwind frontend.
- `apps/desktop/`: Electron desktop launcher and Docker orchestration UI.
- `engine/runtime/`: local Express/Socket.IO bridge, Docker image, RetroArch/GStreamer runtime, Python WebRTC sender, and a mixed TypeScript/JavaScript Node runtime that builds to `dist/`.
- `services/api/`: localhost-first Fastify + TypeScript backend control-plane skeleton.
- `supabase/`: database, storage, RLS, RPC, and realtime migrations.
- `assets/`: README/banner architecture imagery.

Release packaging note: desktop artifacts are produced from `apps/desktop` with
`npm run dist`. That script builds `apps/web/dist` first, and electron-builder
bundles that React production output into the app as `resources/web-dist` for
the LAN HTTPS companion.

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
- `GET /games` and `GET /games/:gameId` read approved game catalog metadata through the API.
- `GET /favorites`, `GET /favorites/:gameId`, `PUT /favorites/:gameId`, and `DELETE /favorites/:gameId` manage favorites through the API.
- `GET /games/:gameId/reactions` and `PUT /games/:gameId/reaction` manage game reactions through the API.
- `GET /games/:gameId/comments`, `POST /games/:gameId/comments`, `DELETE /comments/:commentId`, and `PUT /comments/:commentId/reaction` manage player comments and comment reactions through the API.
- `GET /profile`, `PATCH /profile`, and `DELETE /me/account` manage user profile data and account deletion through the API.
- `POST /games/:gameId/play-count` increments play count through the API instead of direct browser RPC.
- `POST /moderation/comments/:commentId/report` submits comment reports through the API using the authenticated user id.
- `POST /admin/reports/:reportId/action` resolves moderation queue actions through the API for ignore, delete-comment, and ban-user actions.
- `GET /admin/reports` loads the moderation queue through the API for authenticated admins/super admins.
- `GET /admin/users` and `PATCH /admin/users/:userId` move admin user management through the API.
- `GET /admin/access-logs` loads access logs through the API for authenticated admins/super admins.
- `POST /submissions/games` creates developer game submission records through the API for authenticated users.
- `POST /submissions/games` can optionally send the submission notification server-side when `FORMSPREE_SUBMISSION_URL` is configured.
- `POST /access-logs` records guest or authenticated session/access logs through the API.
- `POST /sessions` creates a short-lived backend session for cloud games, persists a hashed session token in Supabase, resolves `games.rom_url || games.rom_filename`, and returns the engine boot target to React.
- `POST /sessions/:sessionId/verify` verifies a short-lived session token and returns the backend-approved boot target to the local engine.
- `POST /local-pairings` persists authenticated local-engine pairing intent and endpoint metadata without storing the desktop pairing token.
- `GET /local-pairings/current` and `DELETE /local-pairings/current` expose/clear the current user's local pairing metadata.
- `PUT /multiplayer/lobbies/:sessionId` persists authenticated host-owned multiplayer lobby metadata without storing engine tokens.
- `GET /multiplayer/lobbies/recent` returns the authenticated host's recent active multiplayer lobbies.
- `DELETE /multiplayer/lobbies/:sessionId` marks the authenticated host's lobby ended.
- `POST /metrics/stream` persists authenticated, sampled WebRTC telemetry snapshots.
- `GET /metrics/stream/recent` returns recent persisted telemetry snapshots for the authenticated user.
- `GET /webrtc/ice-servers` returns authenticated WebRTC ICE configuration. It always supports configured STUN URLs and can issue short-lived coturn REST credentials when `TURN_URLS` and `TURN_SHARED_SECRET` are configured.
- The API schedules control-plane retention cleanup on startup.
- Cleanup deletes expired/stopped backend sessions and stream metrics older than `STREAM_METRIC_RETENTION_DAYS`.
- CORS allows local Vite origins and the hosted Vercel origin.
- API CORS origin matching normalizes trailing slashes to avoid deploy config mistakes.
- Supabase anon/service clients are scaffolded and used by auth/permissions routes when API env vars are configured.
- `services/api/.env` exists locally and is ignored; production keys live on the backend host.
- API cleanup cadence is controlled by `CONTROL_PLANE_CLEANUP_INTERVAL_MS`, defaulting to one hour.
- `services/api/tests/` has a focused `npm run test` suite for persisted sessions, local pairings, stream metrics, and cleanup behavior.
- API tests also cover the backend-owned data boundary for catalog/favorites, comment ownership/reactions, profile update/account deletion, admin user authorization, and admin access-log authorization.
- On 2026-05-26, the local API passed pre-hosting checks after the project owner filled `services/api/.env`: typecheck, lint, build, `/health`, `/ready`, protected-route 401 behavior, and Vercel-origin CORS.
- `apps/web/src/lib/apiClient.ts` calls the API with the current Supabase access token.
- The web API client uses `VITE_API_URL` when configured. If it is missing, localhost browsers fall back to `http://127.0.0.1:4000`, while non-local browser hosts fall back to `https://pixelated-api-services.onrender.com` to avoid production builds accidentally calling viewer-local localhost.
- Cloud/library game boot, game catalog reads, favorites, reactions, comments, profiles, player play-count tracking, game submission metadata/notification, access logging, admin user management, admin access-log reads, admin reports, and comment reporting now depend on the API.
- The web app has no direct Supabase table/RPC/realtime calls under `apps/web/src`; Supabase remains in the browser for auth/session management and Storage uploads.
- `supabase/migrations/20260527111500_api_owned_social_writes.sql` was pushed to hosted Supabase on 2026-05-27, removing direct browser data policies for workflows now owned by the API.

## Web App

Runtime stack:

- Vite + React + TypeScript.
- `@supabase/supabase-js` for auth/session management and direct Storage uploads.
- `apps/web/src/lib/apiClient.ts` for app data reads/writes through `services/api`.
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
- The pairing panel classifies local, LAN, and custom engine URLs; LAN-looking URLs must match an engine reporting `exposureMode: "lan"` from `/health`.
- Pairing errors now distinguish rejected tokens, local-only engines reached through LAN URLs, unreachable LAN hosts, and likely HTTPS-hosted-app to HTTP-LAN browser blocking.
- Hosted Vercel to HTTP LAN engine pairing was blocked by Chrome with `LocalNetworkAccessPermissionDenied` during a 2026-05-28 smoke attempt, so LAN multiplayer still needs a local HTTPS or browser-approved private-network access strategy.
- The desktop pairing token remains browser-local in `localStorage`; the backend only receives the engine URL/intent metadata.
- `useWebRTC` reconnects when the pairing state changes, so pairing from the player page can immediately retry stream startup.
- `useWebRTC` sends sampled telemetry to the API every five seconds when authenticated; telemetry remains visible in the developer toggle.
- `useWebRTC` asks the API for ICE servers before creating the browser peer connection. If the API is unavailable or the user is unsigned, it falls back to Google STUN.
- Failed or long-disconnected WebRTC sessions now show a retry action that creates a fresh session id and restarts negotiation without leaving the player page.
- `/play/:id` is composed from `apps/web/src/features/player/` hooks/components for stream display, telemetry, metadata, reactions, comments, reporting, and play-count tracking.
- The player page now includes a local lobby panel. It displays participants, host/player/spectator roles, assigned player slots, and a copyable `?session=<id>&role=spectator` invite URL.
- Guest player pages opened with a session URL join the existing local-engine session without emitting `start-game`; the engine replays `python-ready` for late joiners when the requested game session is already active.
- Guests can request/release player slots through the lobby panel. Input is attached only when the local participant owns a player slot.
- The lobby panel shows connected participants and lets the host remove non-host guests through the engine `lobby-kick` event.
- Signed-in hosts publish non-secret lobby snapshots to the backend when local `lobby-state` changes. Anonymous/local-only play continues if that backend call is unauthorized or unavailable.
- Local vault uploads/deletes ROMs by calling the local engine with `X-User-Id` and `X-Engine-Token` headers.
- Publishing requires a signed-in user, uploads ROM/images directly from the browser to Supabase Storage bucket `submissions`, then creates submission metadata and triggers optional notification through the API.
- Game catalog, favorites, comments, reactions, profile updates/deletion, admin users, admin reports, and admin access logs are loaded or mutated through the API instead of direct browser Supabase table/RPC/realtime calls.
- Session tracking calls the API to insert browser-load access logs; the backend derives user id from the optional Supabase bearer token.

## Desktop Orchestrator

Runtime stack:

- Electron app in `apps/desktop/main.js`.
- Renderer files: `apps/desktop/index.html` and `apps/desktop/preload.js`.
- Uses local Docker CLI through `child_process.exec`.
- Packaged releases are built with `cd apps/desktop && npm run dist`; this script runs the React production build first and electron-builder bundles `apps/web/dist` as `resources/web-dist`.

Current lifecycle:

1. User clicks initialize in the Electron UI.
2. Electron checks `docker info`.
3. Electron builds local image `pixelated-engine` from `engine/runtime/Dockerfile`.
4. Electron generates a random pairing token for this engine run.
5. Electron displays the pairing token in the desktop UI.
6. Electron removes any stale `pixelated-node` container.
7. Electron runs a detached container named `pixelated-node` with `-v pixelated-roms:/roms`. In local mode it publishes `-p 127.0.0.1:8080:8080`; in explicit LAN mode it publishes `-p 0.0.0.0:8080:8080`. It passes `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"`, `PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co"`, `PIXELATED_API_URL`, `PIXELATED_ENGINE_TOKEN`, `PIXELATED_ENGINE_EXPOSURE_MODE`, and `PIXELATED_ADVERTISED_URLS`.
8. Electron polls `http://127.0.0.1:8080/health` and only marks the engine successful after it returns `ok: true`.
9. On stop/window close, Electron removes `pixelated-node`.

The desktop UI now receives structured engine lifecycle states: checking Docker,
pulling image, building image, removing stale container, starting container,
waiting for health, ready, stopping, stopped, and failed. The launcher still
builds locally by default, but packaged releases can set
`PIXELATED_ENGINE_IMAGE` and `PIXELATED_ENGINE_PULL=1` to pull a prebuilt image
first. Pull failures fall back to a local build unless
`PIXELATED_ENGINE_BUILD_FALLBACK=0` is set.

Notable constraints:

- Container name and port are fixed.
- Build happens on user machine from the distributed app folder.
- Health verifies core local engine dependencies: Xvfb, PulseAudio startup, RetroArch binary/config/core, Python/GStreamer bridge presence, and `/roms` writability.
- LAN/multiplayer support is planned in `.context/lan-multiplayer-plan.md`. Current engine exposure defaults to loopback-only, with explicit desktop LAN mode available for LAN testing.
- LAN mode now also starts a desktop-hosted HTTPS companion server on `PIXELATED_COMPANION_PORT`, defaulting to `8090`.
- The companion server serves the built React app from `apps/web/dist` in development and from bundled `resources/web-dist` in packaged desktop builds. It injects the engine URL override to its own origin and proxies engine HTTP plus Socket.IO/WebSocket traffic to `127.0.0.1:8080`.
- The companion uses a runtime-generated self-signed certificate under the Electron user data directory. Guests may need to trust/bypass that certificate warning during the first LAN test.
- The desktop UI displays HTTPS companion join URLs separately from raw LAN engine URLs.
- The desktop LAN panel now includes a short invite checklist: copy HTTPS join page, send it with the pairing token, and have the guest accept the local certificate warning if shown.
- `PIXELATED_WEB_DIST_DIR` can override the companion asset directory for custom layouts, but release artifacts should use the bundled `resources/web-dist` contract.

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

- `server.ts`: Express + Socket.IO composition root, compiled to `dist/server.js` for runtime start.
- `engine/runtime/src/`: local engine modules for config, health/local vault HTTP routes, Socket.IO signaling, ROM download/storage, runtime process control, input injection, and health telemetry. Config, HTTP routes, signaling/session contracts, runtime process control, ROM/session helpers, input helpers, and health/resource telemetry helpers are now TypeScript.
- `Xvfb :99`: virtual screen.
- PulseAudio system daemon.
- RetroArch process per game.
- `camera.py`: GStreamer `webrtcbin` sender for X11 capture and PulseAudio monitor.
- `npm run build` compiles the runtime to `dist/`; `npm run check`, `npm test`, and Docker startup use compiled JavaScript.

Data paths:

- Local uploaded ROMs are stored under `/roms/<userId>/`, backed by the named Docker volume `pixelated-roms`.
- Cloud ROM URLs are downloaded into `/tmp/cloud_game_<uuid>.nes` after HTTPS, host allowlist, size, and timeout validation. The active temp cloud ROM is deleted on session cleanup or when a new game replaces it.
- Cloud game starts must include `mode: "cloud"` and the backend `sessionToken`; the engine verifies the token through `PIXELATED_API_URL`, requires the verified backend session mode to be `cloud`, and only then uses the backend-approved boot target.

Streaming/signaling:

- `GET /health` is exposed for Electron readiness checks and returns structured subsystem state.
- `/health` also reports `exposureMode` and `advertisedUrls` so the desktop/web surfaces can distinguish local-only and LAN engine exposure.
- Browser connects to Node Socket.IO at `localhost:8080`.
- Node forwards WebRTC offers, answers, and ICE candidates between browser and Python sender inside a Socket.IO room named `session:<id>`.
- Python connects back to Node at `http://localhost:8080`.
- Browser receives VP8 video and Opus audio.
- WebRTC signaling now includes a browser-generated `peerId`. Node places each browser in a peer-specific room so camera answers and ICE candidates route only to the matching browser instead of broadcasting to every viewer in the session.
- `camera.py` now tracks one GStreamer `webrtcbin` pipeline per peer inside the camera process, allowing multiple viewers to negotiate against the same running game session in principle. A real two-browser Docker/RetroArch smoke is still pending.
- Viewer cleanup emits `webrtc-peer-disconnect`, letting the camera tear down that peer pipeline without stopping the host game session.
- `camera.py` writes a small peer-state file so `/health` can report current camera peer count and peer ids during multiplayer smoke tests.
- `/health` now includes `checks.resources` with camera peer state, Node RSS, and RetroArch/camera process RSS plus average CPU since process start when Linux `/proc` data is available.
- The local engine now keeps in-memory lobby state per session. The first browser participant becomes `host` with player slot 1; later participants can join as `player` or `spectator`, request/release player slots, and receive `lobby-state` updates.
- Lobby host permissions gate start, stop, and kick actions engine-side. Host disconnect stops the session; guest disconnect only cleans up that peer/viewer path.
- React forwards API-issued ICE server config in `start-game`; Node passes it to `camera.py` through `PIXELATED_ICE_SERVERS`; Python configures GStreamer `webrtcbin` with the matching STUN/TURN servers.
- React forwards the selected stream profile in `start-game`; Node validates bitrate/framerate bounds and passes it to `camera.py` through `PIXELATED_STREAM_PROFILE`; Python applies the profile to GStreamer capture framerate and VP8 target bitrate.
- React generates the current session id, Node passes it into `camera.py` through `PIXELATED_SESSION_ID`, and both browser/camera sockets join the same room before WebRTC negotiation.
- React polls browser WebRTC stats once per second for FPS, bitrate, ICE state, packet loss, and jitter. The player hides those metrics by default and exposes them through a persisted developer telemetry toggle.
- Engine-side download failures and camera/GStreamer failures emit `engine-error` to the browser session.

Input:

- Browser keydown/keyup events are attached by `apps/web/src/lib/webrtcInput.ts` and go through Socket.IO.
- Browser keydown/keyup events include `playerIndex`, defaulting to player 1 until the lobby UI exposes assigned slots.
- Node authorizes input against local lobby slot state before injecting any key.
- Preferred input path is now virtual gamepads: Node forwards normalized controller actions to `input_gamepad.py`, which creates four Linux `uinput` gamepads through Python `evdev`.
- When `/dev/uinput` is unavailable, Node falls back to X11 keyboard injection for player 1 and player 2 only.
- Player 3 and player 4 require virtual gamepad support; if unavailable, the engine rejects their input with a clear error.
- Node executes `xdotool keydown/keyup` against display `:99`.
- RetroArch config generation enables udev/autodetect and four libretro joypad ports for the virtual gamepad path.
- React emits `stop-session` during player cleanup; Node stops the active emulator/camera processes and removes the active temp cloud ROM.

## Supabase

Used as the persistence/auth/storage provider behind the API:

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
- `multiplayer_lobbies`: backend-owned host lobby metadata for multiplayer sessions without desktop engine tokens.
- `stream_metrics`: sampled WebRTC telemetry for authenticated user sessions.

Storage buckets inferred from migrations:

- `avatars`: public avatar images.
- `default_library`: public library ROM/media assets.
- `submissions`: public developer submission upload target.
- `web_roms`: private user ROM bucket from a migration, but the current local vault code uses the local Docker engine instead.

Security model today:

- App data reads/writes now route through `services/api`; the browser no longer calls Supabase tables, RPCs, or realtime channels directly under `apps/web/src`.
- Supabase RLS remains enabled as defense in depth and for storage/auth-adjacent access, while the backend service-role client performs validated control-plane operations.
- Admin pages still do client-side role checks for routing/UX, but the API performs the real admin/super-admin authorization for admin reads and mutations.
- Local engine HTTP routes and Socket.IO handshakes require the per-run pairing token generated by Electron.
- Cloud game boot also requires backend-created session intent: `mode: "cloud"` plus a session token that the engine verifies with the API before downloading or booting the approved ROM target.
- The hosted React app stores the pairing token in browser `localStorage` and sends it through `X-Engine-Token` for REST calls and Socket.IO auth for streaming.
- The Python camera bridge receives `PIXELATED_ENGINE_TOKEN` through env and uses it when connecting to Node Socket.IO.
- The Docker port is published only to host loopback and the engine CORS origin is set to the hosted Vercel app by Electron.
- Local vault uploads are limited to `.nes` filenames and capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.
- Developer submission storage uploads now require an authenticated Supabase user, and `game_submissions.submitter_id` records who submitted the game.
- Direct public inserts into `access_logs` are disabled; access logs are created by the backend service-role client.
- The pushed hardening migration removes direct browser policies for favorites, likes, comments, comment likes, reported comments, profile updates, and admin access-log reads now that the API/web data boundary is live.

## Deployment Model

Current likely deployment:

- Web frontend hosted on Vercel or similar static hosting.
- Supabase hosted project.
- Local Electron app distributed as `.dmg`, `.exe`, and `.AppImage`.
- Docker engine runs locally on the user's host.
- Browser connects to `localhost:8080`, so the cloud web app depends on a local desktop engine for streaming.

This is closer to a hybrid local cloud-gaming node than a fully hosted cloud-gaming service. That is a valid architecture for developer self-hosting, but it has different scaling needs than a centralized cloud fleet.
