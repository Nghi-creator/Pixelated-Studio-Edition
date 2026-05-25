# Suggestions

Last reviewed: 2026-05-25

This file tracks advisory recommendations and implementation status. Completed tasks are moved into the Done section so the active backlog stays clean.

## Executive Take

The current idea is promising: React/Supabase is fine for the community layer, while the Electron + Docker engine proves the hard part of cloud gaming: isolated execution, capture, encode, signaling, and remote input.

The biggest architectural gap is that the "cloud" runtime is still a trusted local node with a public web UI talking to `localhost:8080`. That is good for a developer sandbox, but it will not scale into a multi-user public cloud-gaming platform until there is a real backend/control plane between users, game sessions, storage, and compute nodes.

Recommended direction:

1. Keep Supabase for auth, profiles, library metadata, simple social features, and admin dashboards.
2. Add a backend control plane before adding caches or heavy infra.
3. Treat each game stream as an isolated session with ownership, lifecycle, observability, and resource limits.
4. Move sensitive operations away from direct browser writes when abuse, billing, moderation, or compute allocation matters.

## Done

### Session-Scoped Signaling

Completed: 2026-05-24

Implemented in:

- `web_server/src/lib/useWebRTC.ts`
- `app_server/server.js`
- `app_server/camera.py`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- React creates a per-player `sessionId`.
- Browser sockets join `session:<id>`.
- `start-game`, WebRTC offers, ICE candidates, and keyboard input include the same `sessionId`.
- Node starts `camera.py` with `PIXELATED_SESSION_ID`.
- Python joins the same Socket.IO room and emits readiness, answers, and ICE candidates with that session id.
- Node relays signaling events only to sockets in the same session room.

Remaining follow-up:

- This scopes signaling, but it does not authorize session membership. Pairing-token enforcement or backend-issued session authorization is still needed.

### Local Engine Boundary Hardening

Completed: 2026-05-24

Implemented in:

- `app_server/main.js`
- `app_server/server.js`
- `web_server/src/lib/engineConfig.ts`
- `web_server/src/lib/useWebRTC.ts`
- `web_server/src/pages/user/LocalVault.tsx`
- `web_server/.env.example`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Electron publishes the container port only to host loopback with `-p 127.0.0.1:8080:8080`.
- Engine CORS no longer uses `origin: "*"`.
- Electron starts the container with `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"`.
- Local ROM uploads are capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.
- Local ROM uploads must use a `.nes` filename.
- Uploaded local ROMs are stored with a generated unique prefix to avoid silent overwrites.
- React engine URL usage is centralized in `web_server/src/lib/engineConfig.ts`.
- `web_server/.env.example` documents `VITE_ENGINE_URL`.

Remaining follow-up:

- LAN streaming should become an explicit opt-in if the project wants to support it.

### Local Engine Pairing Token

Completed: 2026-05-24

Implemented in:

- `app_server/main.js`
- `app_server/preload.js`
- `app_server/index.html`
- `app_server/server.js`
- `app_server/camera.py`
- `web_server/src/lib/engineAuth.ts`
- `web_server/src/lib/useWebRTC.ts`
- `web_server/src/pages/user/LocalVault.tsx`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Electron generates a random engine token when the user starts the engine.
- Electron displays the token in the desktop app with a copy button.
- Electron passes the token into the Docker container as `PIXELATED_ENGINE_TOKEN`.
- The Node engine requires the token for local vault HTTP routes.
- The Node engine requires the token for Socket.IO handshakes.
- The Python camera bridge receives the token through env and uses it when connecting to Socket.IO.
- The hosted React app prompts for the desktop pairing token and stores it in `localStorage`.
- React sends the token through `X-Engine-Token` for REST calls and Socket.IO auth for streaming.
- React clears the stored token when the engine rejects it.

Remaining follow-up:

- The prompt-based UX works, but it should eventually become a polished pairing panel in the web app.
- Tokens rotate every engine start, so users may need to re-enter the token after restarting the desktop engine.

### Engine Health And Startup Readiness

Completed: 2026-05-24

Implemented in:

- `app_server/server.js`
- `app_server/main.js`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- The engine exposes `GET /health`.
- The health response reports `ok`, process uptime, active session id, and whether a pairing token is required.
- Electron removes any stale `pixelated-node` container before starting a new one.
- Electron waits for `/health` to return `ok: true` before showing the engine as successful.
- If health never becomes ready, Electron removes the failed container and returns the UI to stopped state.

Remaining follow-up:

- Startup health now includes the main local engine dependencies. Future health work can add live stream metrics such as FPS, bitrate, ICE state, and encoder errors.

### Deep Engine Health Checks

Completed: 2026-05-25

Implemented in:

- `app_server/server.js`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- `/health` now reports structured subsystem checks.
- Health checks Xvfb process state and display socket readiness.
- Health checks PulseAudio startup process state.
- Health checks RetroArch binary, Mesen core, and RetroArch config presence.
- Health checks Python, GStreamer, and `camera.py` presence.
- Health checks that `/roms` exists and is writable.
- Health reports active runtime state: active session id, RetroArch running, camera running, and active cloud ROM path.
- Electron startup now waits for those required checks to be ready because `/health` returns `503` until `ok` is true.

Remaining follow-up:

- Add live stream telemetry later: FPS, bitrate, ICE connection state, encoder failures, and per-session crash reasons.

### Persistent Local Vault Storage

Completed: 2026-05-24

Implemented in:

- `app_server/main.js`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Electron starts the engine container with `-v pixelated-roms:/roms`.
- Local Vault ROMs now live in a named Docker volume instead of only inside the disposable container filesystem.
- Removing/recreating `pixelated-node` no longer wipes local uploaded ROMs.

Remaining follow-up:

- Add a desktop UI action later if users need to explicitly clear the local ROM volume.

### Cloud ROM Download Hardening

Completed: 2026-05-25

Implemented in:

- `app_server/main.js`
- `app_server/server.js`
- `web_server/src/lib/useWebRTC.ts`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Electron starts the engine with `PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co"`.
- The engine validates cloud ROM URLs before downloading.
- Cloud ROM URLs must use HTTPS.
- Cloud ROM hostnames must be in `PIXELATED_ALLOWED_ROM_HOSTS` when that env var is set.
- Cloud ROM downloads are capped by `PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES`, defaulting to 8 MiB.
- Cloud ROM downloads time out via `PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS`, defaulting to 15 seconds.
- Failed or oversized downloads clean up the temp file.
- React listens for `engine-error` and moves the player to error state when the engine rejects a ROM download.

Remaining follow-up:

- This is still local-engine validation. A future backend should resolve game ids to approved signed ROM manifests instead of accepting URLs from the browser.

### Session Teardown And Temp ROM Cleanup

Completed: 2026-05-25

Implemented in:

- `app_server/server.js`
- `web_server/src/lib/useWebRTC.ts`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- React emits `stop-session` before disconnecting from the local engine.
- Node stops the active RetroArch process for that session.
- Node stops the active Python/GStreamer camera bridge for that session.
- Node tracks the active temp cloud ROM path and deletes it during session cleanup.
- Starting a new game also clears any previous active temp cloud ROM.

Remaining follow-up:

- Session cleanup is still one-active-session-oriented because the local engine currently supports one RetroArch/camera pair at a time.

### Repository Ignore Hygiene

Completed: 2026-05-25

Implemented in:

- `.gitignore`
- `.context/suggestions.md`

What changed:

- Added ignore rules for local env files while preserving `.env.example`.
- Added recursive `.DS_Store` ignore coverage.
- Added `node_modules/` and `dist/` ignore coverage.
- Added Python bytecode and `__pycache__/` ignore coverage.
- Added `supabase/.temp/` ignore coverage.

Remaining follow-up:

- If any generated files are already committed in another branch/history, remove them from Git tracking with `git rm --cached` in a dedicated cleanup commit.

### WebRTC Hook Refactor

Completed: 2026-05-25

Implemented in:

- `web_server/src/lib/useWebRTC.ts`
- `web_server/src/lib/webrtcSession.ts`
- `web_server/src/lib/webrtcPeer.ts`
- `web_server/src/lib/webrtcInput.ts`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- `useWebRTC` now stays focused on React state and lifecycle wiring.
- Game boot target resolution moved to `webrtcSession.ts`.
- Session id creation and the shared WebRTC status type moved to `webrtcSession.ts`.
- Peer connection setup, track handling callback wiring, ICE emission, and offer creation moved to `webrtcPeer.ts`.
- Keyboard input listeners and key event emission moved to `webrtcInput.ts`.

Remaining follow-up:

- Socket event registration still lives in `useWebRTC`; extracting a signaling helper can wait until telemetry adds more event surface area.

### Live Stream Telemetry

Completed: 2026-05-25

Implemented in:

- `web_server/src/lib/useWebRTC.ts`
- `web_server/src/lib/webrtcTelemetry.ts`
- `web_server/src/pages/user/Player.tsx`
- `app_server/server.js`
- `app_server/camera.py`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- React polls `RTCPeerConnection.getStats()` once per second while a player session is active.
- The player UI can show received FPS, received bitrate, ICE state, packet loss, and jitter through an opt-in developer telemetry toggle.
- The telemetry toggle is hidden by default for normal players and persists in `localStorage`.
- React tracks ICE connection state and peer connection state as part of the stream telemetry object.
- Camera/GStreamer errors emit `engine-error` from Python to Node.
- Node relays `engine-error` to the matching session room.
- React stores the latest engine error in telemetry and shows technical error detail only when developer telemetry is enabled.

Remaining follow-up:

- Telemetry is still session-local UI state. A future backend should persist metrics for trend analysis, alerting, and node scheduling.
- Browser stats expose received FPS/bitrate, not encoder-internal FPS. Deeper encoder metrics would require explicit GStreamer probes or structured camera-side telemetry.

### Local Engine Server Module Split

Completed: 2026-05-25

Implemented in:

- `app_server/server.js`
- `app_server/src/config.js`
- `app_server/src/http/healthRoutes.js`
- `app_server/src/http/localVaultRoutes.js`
- `app_server/src/http/errorHandlers.js`
- `app_server/src/signaling/socketAuth.js`
- `app_server/src/signaling/sessionRooms.js`
- `app_server/src/signaling/signalingRelay.js`
- `app_server/src/signaling/startGameHandlers.js`
- `app_server/src/signaling/inputHandlers.js`
- `app_server/src/signaling/engineErrorHandlers.js`
- `app_server/src/runtime/processManager.js`
- `app_server/src/roms/cloudRomDownloader.js`
- `app_server/src/roms/localRomStore.js`
- `app_server/src/input/translateKey.js`
- `app_server/src/input/injectKey.js`
- `app_server/src/telemetry/healthSnapshot.js`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- `app_server/server.js` is now a composition root for Express, Socket.IO, routes, auth, runtime, and health wiring.
- Local Vault HTTP routes moved out of `server.js`.
- Engine token HTTP and Socket.IO auth moved out of `server.js`.
- Session room helpers and signaling relay handlers moved out of `server.js`.
- Start-game, input, and engine-error socket handlers moved out of `server.js`.
- Cloud ROM validation/download and local ROM folder helpers moved out of `server.js`.
- Runtime process state, virtual display startup, game booting, and cleanup moved into `processManager.js`.
- Deep health snapshot generation moved into `telemetry/healthSnapshot.js`.

Remaining follow-up:

- Run a manual runtime smoke test with the Electron/Docker engine because static syntax checks do not prove Xvfb, RetroArch, Socket.IO, and GStreamer work together.
- Continue Phase 2 by splitting `Player.tsx` in place.

### Player Page Feature Split

Completed: 2026-05-25

Implemented in:

- `web_server/src/pages/user/Player.tsx`
- `web_server/src/features/player/PlayerHeader.tsx`
- `web_server/src/features/player/StreamStage.tsx`
- `web_server/src/features/player/StreamTelemetryPanel.tsx`
- `web_server/src/features/player/PlayerControls.tsx`
- `web_server/src/features/player/ReactionButtons.tsx`
- `web_server/src/features/player/useAuthUser.ts`
- `web_server/src/features/player/useGameMetadata.ts`
- `web_server/src/features/player/useGameReactions.ts`
- `web_server/src/features/player/usePlayCount.ts`
- `web_server/src/features/player/types.ts`
- `web_server/src/features/player/comments/CommentsPanel.tsx`
- `web_server/src/features/player/comments/CommentForm.tsx`
- `web_server/src/features/player/comments/CommentItem.tsx`
- `web_server/src/features/player/comments/ReportModal.tsx`
- `web_server/src/features/player/comments/useComments.ts`
- `web_server/src/features/player/comments/useCommentReporting.ts`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- `Player.tsx` is now a route-level composition component instead of owning stream UI, metadata queries, comments, reactions, reporting, and play-count logic directly.
- Stream display and error overlays moved into `StreamStage.tsx`.
- Developer telemetry display moved into `StreamTelemetryPanel.tsx`.
- Header/status/back navigation moved into `PlayerHeader.tsx`.
- Controls and reaction buttons moved into dedicated components.
- Auth user, game metadata, game reactions, play count, comments, and comment reporting moved into feature hooks.

Remaining follow-up:

- The comments hook preserves the current inclusive Supabase range behavior. Decide later whether to rename it as intentional "fetch 11 rows to detect hasMore" or change the range to fetch exactly 10.
- Continue Phase 3 by creating the localhost backend skeleton at `services/api`.

### Localhost Backend Skeleton

Completed: 2026-05-25

Implemented in:

- `services/api/package.json`
- `services/api/package-lock.json`
- `services/api/tsconfig.json`
- `services/api/eslint.config.js`
- `services/api/.env.example`
- `services/api/README.md`
- `services/api/src/server.ts`
- `services/api/src/config/env.ts`
- `services/api/src/plugins/cors.ts`
- `services/api/src/plugins/logger.ts`
- `services/api/src/routes/health.ts`
- `services/api/src/routes/me.ts`
- `services/api/src/modules/auth/supabaseAuth.ts`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added a localhost-first backend skeleton at `services/api`.
- Added Fastify + TypeScript + Zod + pino + Supabase client dependencies.
- Added `GET /health`.
- Added placeholder `GET /me` that returns `501` until Phase 4 auth is implemented.
- Added env parsing with default `HOST=127.0.0.1` and `PORT=4000`.
- Added CORS for local Vite, `127.0.0.1`, and hosted Vercel origins.
- Added lint, typecheck, build, dev, and start scripts.
- Added backend README and `.env.example`.

Remaining follow-up:

- Continue Phase 4 by adding Supabase JWT verification, authenticated `GET /me`, `GET /me/permissions`, and a web API client.

### Backend Auth And Web API Client

Implemented: 2026-05-25

Implemented in:

- `services/api/src/modules/auth/supabaseAuth.ts`
- `services/api/src/types/fastify.d.ts`
- `services/api/src/routes/me.ts`
- `services/api/README.md`
- `web_server/src/lib/apiClient.ts`
- `web_server/.env.example`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added Supabase bearer-token verification middleware for the API.
- Added authenticated `GET /me`.
- Added authenticated `GET /me/permissions`.
- `GET /me/permissions` returns profile role, ban/developer flags, and abilities for admin access, report management, user management, publishing, and ban state.
- Added a web API client that reads `VITE_API_URL` and attaches the current Supabase access token.
- Added `VITE_API_URL=http://127.0.0.1:4000` to the web env example.

Remaining follow-up:

- Populate `services/api/.env` with Supabase URL/keys and run a signed-in browser smoke test.
- Continue Phase 5 by moving low-risk mutations through the backend.

### Low-Risk Mutations Through Backend

Implemented: 2026-05-25

Implemented in:

- `services/api/src/routes/games.ts`
- `services/api/src/routes/moderation.ts`
- `services/api/src/server.ts`
- `web_server/src/lib/apiClient.ts`
- `web_server/src/features/player/usePlayCount.ts`
- `web_server/src/features/player/comments/useCommentReporting.ts`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `POST /games/:gameId/play-count`.
- Added authenticated `POST /moderation/comments/:commentId/report`.
- The backend now uses the authenticated Supabase user id for report `reporter_id`.
- Duplicate comment reports return `409` so the UI can preserve the existing "already reported" message.
- `usePlayCount` now calls the API instead of direct Supabase RPC.
- `useCommentReporting` now calls the API instead of directly inserting into `reported_comments`.

Remaining follow-up:

- Populate `services/api/.env` and run a signed-in end-to-end smoke test for play-count and comment-report mutations.
- Admin report actions still happen directly in the browser and should move later.
- Continue Phase 6 by adding backend session creation for cloud games.

## Highest Priority Issues

### 1. Add a Real Backend Control Plane

Today the frontend talks directly to Supabase and directly to the local engine. For small scale, that is fast. For larger scale, the missing backend becomes the place where all hard decisions pile up.

Add a backend service when you want:

- Session creation and authorization.
- Game node allocation.
- Signed ROM/media URLs.
- Rate limits and upload validation.
- Moderation workflow.
- Admin actions with audit logs.
- TURN credential generation.
- Session cleanup.
- Metrics and billing hooks later.

Good first version:

- Node.js with Fastify/NestJS or Express if you want minimal migration.
- Supabase JWT verification for auth.
- Postgres via Supabase for persistent state.
- Redis for ephemeral session state, queues, locks, and rate limits.
- REST endpoints for normal app workflows and Socket.IO/WebSocket only for realtime session control.

Suggested first backend endpoints:

- `POST /sessions`: create a playable game session and return signaling/session info.
- `DELETE /sessions/:id`: stop a session.
- `POST /uploads/submissions`: validate and sign upload paths.
- `POST /moderation/reports/:id/actions`: approve/delete/ban/ignore.
- `GET /me/permissions`: centralize role/ability checks.

### 2. Secure The Local Engine Boundary

The local engine is now protected by host-loopback binding, restricted CORS, and a pairing token. The remaining work is mostly UX and explicit LAN support.

Remaining suggested improvements:

- If LAN streaming is intentional, make it an explicit setting with a warning.

### 3. Improve Docker Build/Run Lifecycle

The Electron app builds the image on demand and uses a fixed container name/port. This is workable for a demo, but fragile for users.

Suggested improvements:

- Build and publish the engine image ahead of time, then `docker pull` tagged versions.
- Keep local build as a development fallback.
- Add more structured engine states: checking Docker, pulling/building image, starting container, waiting for health, ready, failed.

### 4. Fix WebRTC Production Readiness

Google STUN alone is not enough for real users and varied networks.

Suggested improvements:

- Add TURN support.
- Generate short-lived TURN credentials from the backend.
- Add reconnect/fail recovery flows beyond the current ICE/error display.
- Add bitrate/framerate profiles.
- Add a fallback message when the local engine is offline.

## Database And Supabase Suggestions

### Keep Supabase For These

- Auth.
- Profiles and social graph.
- Game metadata.
- Comments/reactions/favorites.
- Admin dashboards at early scale.
- Storage buckets for public covers/banners and approved ROMs.

### Move Or Gate These Through Backend Over Time

- Game submissions.
- Admin actions.
- Access logging.
- Play-count increments.
- ROM URL resolution.
- Upload signing and validation.
- Anything that needs rate limiting, abuse prevention, or audit trails.

### RLS Review Items

Do a dedicated RLS pass before public launch:

- Confirm admin/super_admin policies cannot be bypassed by client writes.
- Confirm profile role/is_banned columns are protected on insert and update.
- Ensure public upload policies cannot turn storage into an abuse sink.
- Add size/type limits at the application/backend layer because RLS alone is not enough.
- Prefer RPCs for sensitive state transitions such as bans, approvals, and play counting.

## Code Health Observations

### Frontend

- `useWebRTC` has been split into focused session, peer, and input helpers. Socket event registration remains in the hook for now.
- Player sessions now expose opt-in browser-side stream telemetry: FPS, bitrate, ICE state, packet loss, jitter, and last engine error.
- Several Supabase queries/actions are embedded directly in page components. Introduce small data modules/hooks for games, comments, favorites, moderation, and profiles.
- Admin access is checked in UI, but the UI should treat RLS/backend authorization as the source of truth.
- `fetchComments` uses `.range(pageNum * 10, (pageNum + 1) * 10)`, which requests 11 rows because Supabase ranges are inclusive. If the intent is "fetch 11 to detect hasMore", name that explicitly; otherwise use end `pageNum * 10 + 9`.

### Engine

- Session signaling now uses rooms, but the engine still supports only one active RetroArch/camera pair at a time.
- `exec` is used for `xdotool` key events. Current key mapping is allowlisted, which helps, but `spawn` with args would be cleaner.
- `bootGame` kills global processes, so one engine supports one active game at a time. That is fine for a local node, but it should be explicit.
- `startVirtualDisplay` starts Xvfb/PulseAudio without retaining process handles or checking failures.

### Docker

- `RUN npm install express socket.io cors` before copying `package*.json` duplicates dependency installation and weakens caching discipline.
- The image compiles Mesen from GitHub at build time. Pin commits/tags for reproducible builds.
- Consider multi-stage builds or a prebuilt engine image. Current image is likely large and slow to build.
- `pulseaudio --system` is generally awkward operationally; document why it is used and capture logs/exit status.

### Repository Hygiene

- Generated dependency/build/cache files are now covered by `.gitignore`.
- Consider separate READMEs for web app, desktop app, and engine internals.
- Add `.env.example` files for the web and engine.

## Scaling Roadmap

### Phase 0: Stabilize Current Demo

- Add `.context` docs.
- Remove generated/binary artifacts from git tracking if currently committed.

### Phase 1: Backend Control Plane

- Create backend service.
- Verify Supabase JWTs.
- Add `sessions` table.
- Move session creation and ROM URL resolution to backend.
- Add Redis for session TTLs, rate limiting, and locks.
- Add basic audit logs for admin actions.

### Phase 2: Hosted Node Fleet

- Run engine containers on dedicated hosts.
- Use backend scheduler to allocate a node.
- Use per-session containers or process isolation.
- Add TURN server.
- Add node heartbeat and capacity reporting.
- Store stream/session metrics.

### Phase 3: Production Platform

- Queue users when capacity is full.
- Add autoscaling by queue depth and node utilization.
- Add object scanning/moderation for uploads.
- Add CDN for covers/banners/static assets.
- Add billing/quotas if needed.
- Add observability stack: logs, metrics, traces, alerts.

## Recommended First Implementation Batch

The implementation batch is paused while the architecture is reconsidered. See:

- `.context/target-architecture-refurbishment.md`
- `.context/refurbishment-execution-plan.md`

Recommended next work after review:

1. Add backend session creation for cloud games.
2. Add backend, web, desktop, and engine READMEs.
