# Suggestions

Last reviewed: 2026-05-28

This file tracks advisory recommendations and implementation status. Completed tasks are moved into the Done section so the active backlog stays clean.

## Executive Take

The current idea is promising: React/Supabase is fine for the community layer, while the Electron + Docker engine proves the hard part of cloud gaming: isolated execution, capture, encode, signaling, and remote input.

The backend control plane now owns the web app data boundary. Backend-issued cloud session intent is authoritative across web, API, and engine, and the frontend no longer calls Supabase tables, RPCs, or realtime channels directly. The next implementation gap is explicit LAN-mode product support, then later hosted engine scheduling.

Recommended direction:

1. Keep Supabase for auth, profiles, library metadata, simple social features, and admin dashboards.
2. Keep app data reads/writes behind `services/api`; keep browser Supabase usage limited to auth/session and intentional Storage uploads.
3. Treat each game stream as an isolated session with ownership, lifecycle, observability, and resource limits.
4. Add durable session/metric storage before multi-replica API hosting or hosted engine scheduling.

## Done

### Multiplayer Input Routing

Completed: 2026-05-28

Implemented in:

- `apps/web/src/lib/webrtcInput.ts`
- `engine/runtime/server.js`
- `engine/runtime/src/input/translateKey.js`
- `engine/runtime/src/runtime/processManager.js`
- `engine/runtime/src/signaling/inputHandlers.ts`
- `engine/runtime/src/signaling/inputHandlers.test.ts`
- `engine/runtime/src/signaling/lobby.ts`
- `.context/lan-multiplayer-plan.md`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- React input events now include `playerIndex`, defaulting to player 1 for the current single-player UI.
- The engine validates keyboard input against lobby slot ownership before injecting keys.
- Spectators cannot control the emulator.
- A guest assigned to player slot 2 cannot emit player slot 1 input.
- Player 1 keeps the existing arrow/Z/X/Enter/Shift keyboard path.
- Player 2 maps the same browser controls onto W/A/S/D/F/G/R/T before `xdotool` injection.
- RetroArch config generation now writes explicit player 1 and player 2 keyboard binds.
- Added automated tests for host input, player 2 mapping, spectator rejection, and wrong-slot rejection.

Remaining follow-up:

- Manual smoke with a two-player test ROM or RetroArch input diagnostic.
- Add React lobby UI so guests can see and request their assigned slots.
- Decide the slots 3 and 4 input strategy, likely virtual gamepads or deeper RetroArch input config instead of more shared keyboard mapping.

### Engine Lobby Role Foundation

Completed: 2026-05-28

Implemented in:

- `engine/runtime/server.js`
- `engine/runtime/src/signaling/lobby.ts`
- `engine/runtime/src/signaling/lobby.test.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `.context/lan-multiplayer-plan.md`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added in-memory local engine lobby state keyed by session id.
- The first browser participant becomes the `host` and receives player slot 1.
- Later participants can join as `player` or `spectator`; duplicate host requests are downgraded to spectator.
- Added player slot request/release behavior.
- Added host-only lobby kick behavior.
- Added `lobby-state`, `lobby-error`, and `lobby-kicked` Socket.IO events.
- Restricted engine-side game start/stop to the lobby host when lobby state exists.
- Added focused engine tests for host assignment, duplicate host handling, slot requests, host kicks, and guest kick rejection.

Remaining follow-up:

- Add React lobby UI that consumes `lobby-state` and exposes participants/slots.
- Add guest invite/join UX for LAN sessions.
- Implement Phase 4 slot-aware input authorization before guests can control the emulator.
- Decide the local HTTPS/private-network strategy because hosted Vercel to HTTP LAN engine fetches are blocked in Chrome.

### Engine Runtime TypeScript Phase 0A

Completed: 2026-05-28

Implemented in:

- `engine/runtime/tsconfig.json`
- `engine/runtime/package.json`
- `engine/runtime/package-lock.json`
- `engine/runtime/Dockerfile`
- `engine/runtime/src/config.ts`
- `engine/runtime/src/signaling/sessionRooms.ts`
- `engine/runtime/src/signaling/socketAuth.ts`
- `engine/runtime/src/signaling/signalingRelay.ts`
- `engine/runtime/src/signaling/engineErrorHandlers.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/signaling/inputHandlers.ts`
- `engine/runtime/README.md`
- `.context/lan-multiplayer-plan.md`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added TypeScript build support to `engine/runtime`.
- The runtime now compiles mixed `.ts` and `.js` source into `dist/`.
- `npm run check`, `npm test`, and `npm start` now use compiled JavaScript.
- Docker image builds now run `npm run build` and start with `npm start`.
- Converted the engine config and multiplayer-adjacent signaling/session/input modules to TypeScript.
- Typed core start-game payloads, ICE server normalization, stream profile normalization, session-room helpers, socket token auth, signaling relay events, engine-error relay, and input handler payloads.
- Kept remaining engine modules as JavaScript for later targeted migration.

Remaining follow-up:

- Docker build smoke once Docker Desktop is reachable from the CLI again.
- Convert runtime process manager and Local Vault route/storage modules when multiplayer slots or local identity hardening touches them.
- Desktop TypeScript migration remains a later Phase 0B task.

### Explicit Desktop LAN Mode Toggle

Completed: 2026-05-28

Implemented in:

- `apps/desktop/main.js`
- `apps/desktop/preload.js`
- `apps/desktop/index.html`
- `engine/runtime/src/config.ts`
- `engine/runtime/src/telemetry/healthSnapshot.js`
- `engine/runtime/server.js`
- `.context/lan-multiplayer-plan.md`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- Added an explicit LAN mode toggle to the desktop launcher, default off.
- Local mode keeps Docker publishing on `127.0.0.1:8080:8080`.
- LAN mode publishes Docker on `0.0.0.0:8080:8080`.
- Desktop discovers host LAN IPv4 URLs and displays them when LAN mode is active.
- Desktop still generates a fresh pairing token for each engine start.
- Desktop locks exposure mode while the engine is running, so changing mode requires stopping and starting the engine again.
- The engine receives `PIXELATED_ENGINE_EXPOSURE_MODE` and `PIXELATED_ADVERTISED_URLS`.
- `/health` now reports `exposureMode` and `advertisedUrls`.
- The multiplayer plan now includes the TypeScript migration track for engine and desktop code.

Remaining follow-up:

- Two-device LAN smoke test: confirm another LAN device can reach `/health` only after LAN mode is enabled.
- Add one-click restart-on-toggle later if changing exposure mode while running should feel smoother.

### LAN Pairing UX

Completed: 2026-05-28

Implemented in:

- `apps/web/src/features/local-engine/EnginePairingPanel.tsx`
- `.context/lan-multiplayer-plan.md`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- The pairing panel now classifies engine URLs as local, LAN, or custom.
- LAN URLs get explicit warning/context copy instead of being treated like `localhost`.
- Engine URL validation now requires `http://` or `https://`.
- Pairing reads `/health` and checks `exposureMode`.
- LAN-looking URLs are rejected if the engine reports local-only mode.
- Wrong token errors now tell the user to copy the current desktop token.
- Unreachable LAN errors now point users toward LAN mode, same-network checks, and possible hosted-HTTPS to HTTP-LAN browser blocking.
- Backend pairing metadata still stores only non-secret engine URL data; the desktop token remains browser-local.

Remaining follow-up:

- Hosted-browser LAN smoke confirmed Chrome blocks HTTP LAN engine fetches from the HTTPS Vercel origin with `LocalNetworkAccessPermissionDenied`.
- Decide between local engine HTTPS, a local companion web origin, or another browser-approved private-network access strategy before calling LAN pairing shippable.

### Backend Session Intent Validation

Completed: 2026-05-27

Implemented in:

- `apps/web/src/lib/webrtcSession.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/sessions/verifyBackendSession.js`
- `engine/runtime/src/signaling/startGameHandlers.test.js`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Cloud player starts now send explicit `mode: "cloud"` with the backend `sessionToken`.
- Local Vault starts now send explicit `mode: "local"` and continue without a backend session token.
- The local engine treats `mode: "cloud"` or any provided `sessionToken` as backend session intent.
- Cloud intent without a session token is rejected before any ROM can boot.
- After `POST /sessions/:sessionId/verify`, the engine requires the verified backend session mode to be `cloud`.
- The engine still uses the local pairing token for Socket.IO and Local Vault boundaries; the desktop pairing secret is not sent to the hosted backend.

Remaining follow-up:

- Runtime-smoke a signed-in cloud game through hosted Vercel, hosted Render, and the desktop engine after redeploying these changes.

### Session-Scoped Signaling

Completed: 2026-05-24

Implemented in:

- `apps/web/src/lib/useWebRTC.ts`
- `engine/runtime/server.js`
- `engine/runtime/camera.py`
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

- Signaling is now scoped and token-gated. Hosted cloud boot also has backend session verification; Local Vault still intentionally uses local pairing as its authority.

### Local Engine Boundary Hardening

Completed: 2026-05-24

Implemented in:

- `apps/desktop/main.js`
- `engine/runtime/server.js`
- `apps/web/src/lib/engineConfig.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/pages/user/LocalVault.tsx`
- `apps/web/.env.example`
- `.context/project-flows.md`
- `.context/current-infrastructure.md`

What changed:

- Electron publishes the container port only to host loopback with `-p 127.0.0.1:8080:8080`.
- Engine CORS no longer uses `origin: "*"`.
- Electron starts the container with `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"`.
- Local ROM uploads are capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.
- Local ROM uploads must use a `.nes` filename.
- Uploaded local ROMs are stored with a generated unique prefix to avoid silent overwrites.
- React engine URL usage is centralized in `apps/web/src/lib/engineConfig.ts`.
- `apps/web/.env.example` documents `VITE_ENGINE_URL`.

Remaining follow-up:

- LAN streaming should become an explicit opt-in if the project wants to support it.

### Local Engine Pairing Token

Completed: 2026-05-24

Implemented in:

- `apps/desktop/main.js`
- `apps/desktop/preload.js`
- `apps/desktop/index.html`
- `engine/runtime/server.js`
- `engine/runtime/camera.py`
- `apps/web/src/lib/engineAuth.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/pages/user/LocalVault.tsx`
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

- Tokens rotate every engine start, so users may need to re-enter the token after restarting the desktop engine.

### Engine Health And Startup Readiness

Completed: 2026-05-24

Implemented in:

- `engine/runtime/server.js`
- `apps/desktop/main.js`
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

- `engine/runtime/server.js`
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

- `apps/desktop/main.js`
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

- `apps/desktop/main.js`
- `engine/runtime/server.js`
- `apps/web/src/lib/useWebRTC.ts`
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

- Backend-created session tokens are now verified by the engine and persisted in Supabase.

### Session Teardown And Temp ROM Cleanup

Completed: 2026-05-25

Implemented in:

- `engine/runtime/server.js`
- `apps/web/src/lib/useWebRTC.ts`
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

- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/lib/webrtcSession.ts`
- `apps/web/src/lib/webrtcPeer.ts`
- `apps/web/src/lib/webrtcInput.ts`
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

- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/lib/webrtcTelemetry.ts`
- `apps/web/src/pages/user/Player.tsx`
- `engine/runtime/server.js`
- `engine/runtime/camera.py`
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

- Backend telemetry is now persisted. Add retention cleanup and dashboards before using it for alerting or node scheduling.
- Browser stats expose received FPS/bitrate, not encoder-internal FPS. Deeper encoder metrics would require explicit GStreamer probes or structured camera-side telemetry.

### Local Engine Server Module Split

Completed: 2026-05-25

Implemented in:

- `engine/runtime/server.js`
- `engine/runtime/src/config.ts`
- `engine/runtime/src/http/healthRoutes.js`
- `engine/runtime/src/http/localVaultRoutes.js`
- `engine/runtime/src/http/errorHandlers.js`
- `engine/runtime/src/signaling/socketAuth.ts`
- `engine/runtime/src/signaling/sessionRooms.ts`
- `engine/runtime/src/signaling/signalingRelay.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/signaling/inputHandlers.ts`
- `engine/runtime/src/signaling/engineErrorHandlers.ts`
- `engine/runtime/src/runtime/processManager.js`
- `engine/runtime/src/roms/cloudRomDownloader.js`
- `engine/runtime/src/roms/localRomStore.js`
- `engine/runtime/src/input/translateKey.js`
- `engine/runtime/src/input/injectKey.js`
- `engine/runtime/src/telemetry/healthSnapshot.js`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- `engine/runtime/server.js` is now a composition root for Express, Socket.IO, routes, auth, runtime, and health wiring.
- Local Vault HTTP routes moved out of `server.js`.
- Engine token HTTP and Socket.IO auth moved out of `server.js`.
- Session room helpers and signaling relay handlers moved out of `server.js`.
- Start-game, input, and engine-error socket handlers moved out of `server.js`.
- Cloud ROM validation/download and local ROM folder helpers moved out of `server.js`.
- Runtime process state, virtual display startup, game booting, and cleanup moved into `processManager.js`.
- Deep health snapshot generation moved into `telemetry/healthSnapshot.js`.

Remaining follow-up:

- Run a manual runtime smoke test with the Electron/Docker engine because static syntax checks do not prove Xvfb, RetroArch, Socket.IO, and GStreamer work together.

### Player Page Feature Split

Completed: 2026-05-25

Implemented in:

- `apps/web/src/pages/user/Player.tsx`
- `apps/web/src/features/player/PlayerHeader.tsx`
- `apps/web/src/features/player/StreamStage.tsx`
- `apps/web/src/features/player/StreamTelemetryPanel.tsx`
- `apps/web/src/features/player/PlayerControls.tsx`
- `apps/web/src/features/player/ReactionButtons.tsx`
- `apps/web/src/features/player/useAuthUser.ts`
- `apps/web/src/features/player/useGameMetadata.ts`
- `apps/web/src/features/player/useGameReactions.ts`
- `apps/web/src/features/player/usePlayCount.ts`
- `apps/web/src/features/player/types.ts`
- `apps/web/src/features/player/comments/CommentsPanel.tsx`
- `apps/web/src/features/player/comments/CommentForm.tsx`
- `apps/web/src/features/player/comments/CommentItem.tsx`
- `apps/web/src/features/player/comments/ReportModal.tsx`
- `apps/web/src/features/player/comments/useComments.ts`
- `apps/web/src/features/player/comments/useCommentReporting.ts`
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

- Keep this service updated as the control-plane contracts move toward tests, retention, and hosted engine scheduling.

### Backend Auth And Web API Client

Implemented: 2026-05-25

Implemented in:

- `services/api/src/modules/auth/supabaseAuth.ts`
- `services/api/src/types/fastify.d.ts`
- `services/api/src/routes/me.ts`
- `services/api/README.md`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/.env.example`
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

- Run a signed-in browser smoke test against the hosted API.

### Low-Risk Mutations Through Backend

Implemented: 2026-05-25

Implemented in:

- `services/api/src/routes/games.ts`
- `services/api/src/routes/moderation.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/features/player/usePlayCount.ts`
- `apps/web/src/features/player/comments/useCommentReporting.ts`
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

- Run a signed-in end-to-end smoke test for play-count and comment-report mutations against the hosted API.
- Admin report actions now happen through the API; add dedicated admin action tests when that area gets its next pass.

### Backend Cloud Session Creation

Implemented: 2026-05-25

Implemented in:

- `services/api/src/routes/sessions.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/lib/webrtcSession.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `POST /sessions`.
- Added `GET /sessions/:sessionId` and `DELETE /sessions/:sessionId` for the localhost proof.
- Backend resolves cloud game ROM targets from Supabase instead of React querying `games.rom_url` directly.
- Backend returns `sessionId`, short-lived `sessionToken`, `engineUrl`, `expiresAt`, authenticated user id, and boot target.
- Sessions are persisted in `backend_sessions` after the first localhost proof.
- React cloud game boot now calls `api.createSession()` before emitting `start-game`.
- Local Vault `.nes` boot still uses the existing local path and does not require backend session creation.

Remaining follow-up:

- Run a signed-in end-to-end smoke test for cloud game boot against the hosted Vercel + Render stack.
- Add cleanup for expired persisted sessions.

### Backend Session Verification By Engine

Implemented: 2026-05-27

Implemented in:

- `services/api/src/routes/sessions.ts`
- `engine/runtime/server.js`
- `engine/runtime/src/config.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/sessions/verifyBackendSession.js`
- `apps/desktop/main.js`
- `apps/desktop/README.md`
- `engine/runtime/README.md`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- Added backend `POST /sessions/:sessionId/verify`.
- Backend session records now retain the approved boot target for verification.
- Expired persisted sessions are ignored on read/verify.
- Authenticated `GET /sessions/:sessionId` and `DELETE /sessions/:sessionId` now only expose/delete sessions owned by the authenticated user.
- The engine now rejects cloud URL boot requests that do not include a backend session token.
- The engine verifies `sessionToken` with the API before booting a cloud game.
- After verification, the engine uses the backend-approved boot target instead of trusting the browser-supplied URL.
- Electron passes `PIXELATED_API_URL` into the engine container, defaulting to the hosted Render API while allowing localhost override for development.

Remaining follow-up:

- Runtime-smoke a signed-in cloud game through hosted Vercel, hosted Render, and the desktop engine after redeploying these changes.
- Add automated API tests for create/verify/expiry/ownership behavior.

### Persistent Backend Control-Plane State

Implemented: 2026-05-27

Implemented in:

- `supabase/migrations/20260527093000_backend_control_plane_state.sql`
- `services/api/src/routes/sessions.ts`
- `services/api/src/routes/localPairings.ts`
- `services/api/src/routes/metrics.ts`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- Added `backend_sessions` for durable cloud session records.
- Session tokens are stored as SHA-256 hashes instead of raw tokens.
- Session verification now reads the persisted session row and approved boot target.
- Authenticated session lookup/delete now read/update persisted rows.
- Added `local_engine_pairings` for durable local engine pairing intent metadata.
- Local pairing secrets still stay browser-local; only engine URL and metadata are persisted.
- Added `stream_metrics` for sampled WebRTC telemetry.
- Stream metric rate limiting now checks the latest persisted sample for the user/session.
- Recent stream metrics are read from Supabase instead of API process memory.
- RLS is enabled on all new tables; browser-readable policies exist only for own local pairing and own stream metrics, while backend writes use the service-role client.

Remaining follow-up:

- Keep hosted API deploys aligned with migrations that change persisted control-plane tables.
- Add automated API tests for session persistence, token verification, pairing upsert/delete, and metric rate limiting.

### Backend Control-Plane Retention Cleanup

Implemented: 2026-05-27

Implemented in:

- `services/api/src/config/env.ts`
- `services/api/src/modules/maintenance/controlPlaneCleanup.ts`
- `services/api/src/server.ts`
- `services/api/.env.example`
- `.context/suggestions.md`
- `.context/current-infrastructure.md`
- `.context/backend-hosting-checklist.md`

What changed:

- Added a scheduled API cleanup job for persisted control-plane records.
- Expired `backend_sessions` rows are deleted.
- Soft-deleted/stopped `backend_sessions` rows are deleted.
- `stream_metrics` rows older than the configured retention period are deleted.
- Added `CONTROL_PLANE_CLEANUP_INTERVAL_MS`, defaulting to one hour.
- Added `STREAM_METRIC_RETENTION_DAYS`, defaulting to seven days.
- Cleanup skips safely when the Supabase service-role client is not configured.

Remaining follow-up:

- Add automated API tests for session persistence, token verification, pairing upsert/delete, metric rate limiting, and cleanup behavior.

### Backend Control-Plane API Tests

Implemented: 2026-05-27

Implemented in:

- `services/api/package.json`
- `services/api/src/controlPlane.test.ts`
- `services/api/src/routes/sessions.ts`
- `services/api/src/routes/localPairings.ts`
- `services/api/src/routes/metrics.ts`
- `services/api/src/modules/maintenance/controlPlaneCleanup.ts`
- `.context/suggestions.md`
- `.context/current-infrastructure.md`

What changed:

- Added `npm run test` for the API service.
- Added Fastify injection tests that run without a live Supabase database.
- Route modules now accept injectable auth and Supabase dependencies for tests.
- Tests cover persisted session creation and hashed token storage.
- Tests cover backend session token verification and bad-token rejection.
- Tests cover session ownership protection.
- Tests cover local pairing upsert/read/delete behavior.
- Tests cover stream metric persistence and per-user/session rate limiting.
- Tests cover cleanup for expired sessions, stopped sessions, and old stream metrics.

Remaining follow-up:

- Add integration smoke tests with a real staged Supabase access token when practical.

### Admin Report Actions Through Backend

Implemented: 2026-05-27

Implemented in:

- `services/api/src/routes/moderation.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `apps/web/src/components/admin/ReportCard.tsx`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `POST /admin/reports/:reportId/action`.
- Supported actions are `ignore`, `delete_comment`, and `ban_user`.
- Backend verifies the acting user is an admin or super admin before resolving a report.
- Backend preserves the existing peer-review rule: non-super-admins cannot resolve reports they submitted.
- Backend preserves the existing admin-target rule: only super admins can resolve reports against admins/super admins.
- Backend prevents self-ban.
- Ignoring a report deletes only the report row.
- Deleting a comment removes the reported comment, allowing report cleanup through cascade behavior.
- Banning a user sets `profiles.is_banned = true` and deletes the reported comment.
- Admin dashboard actions now call the API instead of writing directly to Supabase from the browser.

Remaining follow-up:

- Add dedicated admin action tests with fake Supabase coverage.

### Admin Report Queue Through Backend

Implemented: 2026-05-27

Implemented in:

- `services/api/src/routes/moderation.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `GET /admin/reports`.
- Backend verifies the acting user is an admin or super admin before returning reports.
- Admin dashboard now loads the moderation queue through the API instead of directly querying `reported_comments` from the browser.
- The moderation queue is now backend-shaped for both reads and destructive actions.

Remaining follow-up:

- Add dedicated admin moderation tests with fake Supabase coverage.

### Game Submission Metadata Through Backend

Implemented: 2026-05-27

Implemented in:

- `supabase/migrations/20260527103000_secure_game_submissions.sql`
- `services/api/src/routes/submissions.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/pages/user/Publish.tsx`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added `game_submissions.submitter_id`.
- Enabled RLS on `game_submissions`.
- Added user/admin read policies for game submissions.
- Replaced public uploads to the `submissions` bucket with authenticated uploads.
- Added authenticated `POST /submissions/games`.
- Backend validates submission metadata and requires file URLs to come from the Supabase `submissions` bucket.
- Backend records the authenticated submitter id when creating `game_submissions`.
- Backend optionally sends the submission notification when `FORMSPREE_SUBMISSION_URL` is configured.
- Publish page now requires sign-in before uploading.
- Publish page now creates submission metadata through the API instead of inserting directly into Supabase.
- Publish page no longer calls Formspree directly from the browser.
- The migration was pushed to hosted Supabase on 2026-05-27.

Remaining follow-up:

- Add API tests for `POST /submissions/games`.
- Configure `FORMSPREE_SUBMISSION_URL` on the backend host if email notifications should be sent in production.

### Access Logging Through Backend

Implemented: 2026-05-27

Implemented in:

- `supabase/migrations/20260527104500_backend_access_logs.sql`
- `services/api/src/routes/accessLogs.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/lib/useSessionTracker.ts`
- `supabase/migrations/20260527104500_backend_access_logs.sql`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added `POST /access-logs`.
- Backend supports guest logs and authenticated logs on the same endpoint.
- Backend derives `user_id` from the optional Supabase bearer token instead of trusting browser payloads.
- Session tracker now calls the API instead of inserting directly into Supabase.
- Access log entries now include the current browser path.
- Removed the public insert RLS policy on `access_logs`.
- The migration was pushed to hosted Supabase on 2026-05-27.

Remaining follow-up:

- Admin access-log list fetching now happens through the API as part of the frontend data-boundary pass.
- Add API tests for `POST /access-logs` and `GET /admin/access-logs`.

### Frontend Data Boundary Through Backend

Implemented: 2026-05-27

Implemented in:

- `services/api/src/routes/catalog.ts`
- `services/api/src/routes/profiles.ts`
- `services/api/src/routes/adminUsers.ts`
- `services/api/src/routes/accessLogs.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/pages/user/Landing.tsx`
- `apps/web/src/pages/user/Favorites.tsx`
- `apps/web/src/pages/user/Profile.tsx`
- `apps/web/src/components/user/GameCard.tsx`
- `apps/web/src/components/user/HeroBanner.tsx`
- `apps/web/src/features/player/useGameMetadata.ts`
- `apps/web/src/features/player/useGameReactions.ts`
- `apps/web/src/features/player/comments/useComments.ts`
- `apps/web/src/components/layout/AdminLayout.tsx`
- `apps/web/src/components/layout/Navbar.tsx`
- `apps/web/src/pages/admin/Dashboard.tsx`
- `apps/web/src/pages/admin/UserManagement.tsx`
- `apps/web/src/pages/admin/AccessLogs.tsx`
- `supabase/migrations/20260527111500_api_owned_social_writes.sql`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`
- `services/api/README.md`

What changed:

- Added API routes for game catalog reads, favorites, game reactions, comments, comment reactions, profile reads/updates/deletion, admin user management, and admin access-log reads.
- Updated the React API client to cover those routes.
- Moved library loading, favorites, game metadata, reactions, comments, profile updates, account deletion, admin user management, admin access logs, admin permission checks, and navbar/admin layout permission checks through the API.
- Moved the game submission notification side effect through the API.
- Removed the remaining frontend Supabase table/RPC/realtime usage under `apps/web/src`.
- Browser Supabase usage is now limited to auth/session handling and intentional Storage uploads for avatars and submissions.
- Added a staged hardening migration that removes now-obsolete direct browser policies for favorites, likes, comments, comment likes, reported comments, profile updates, and admin access-log reads.
- The hardening migration was pushed to hosted Supabase on 2026-05-27.

Remaining follow-up:

- Browser-smoke signed-in library, favorites, comments/reactions, profile update, admin users, and admin access logs against the hosted stack.

### Backend-Owned Data Route Tests

Implemented: 2026-05-27

Implemented in:

- `services/api/src/dataBoundary.test.ts`
- `services/api/src/routes/accessLogs.ts`
- `services/api/src/routes/adminUsers.ts`
- `services/api/src/routes/catalog.ts`
- `services/api/src/routes/profiles.ts`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added Fastify injection tests for the API-owned data boundary without requiring a live Supabase database.
- Route modules for catalog/social/profile/admin-user/access-log flows now support injectable auth and Supabase dependencies, matching the existing control-plane test pattern.
- Tests cover game catalog and favorite reads/deletes.
- Tests cover comment deletion scoping: regular users can only delete their own comments, while admins can delete any comment.
- Tests cover comment reaction replacement and self-reaction rejection.
- Tests cover profile update scoping and account deletion via Supabase auth admin.
- Tests cover admin-user and admin-access-log authorization for regular users, admins, and super admins.

Remaining follow-up:

- Add tests for the submission notification path and admin report action edge cases when those areas get their next pass.

### Backend Hosting Prep

Implemented: 2026-05-25

Implemented in:

- `services/api/.env`
- `services/api/.env.example`
- `services/api/README.md`
- `services/api/src/config/env.ts`
- `services/api/src/plugins/cors.ts`
- `services/api/src/routes/health.ts`
- `.context/backend-hosting-checklist.md`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Created a local ignored backend `.env` file with blank Supabase values for the project owner to fill.
- Updated `.env.example` to include both local Vite and hosted Vercel web origins.
- Blank Supabase env values now parse as missing values instead of crashing the API on startup.
- Production startup now defaults to `HOST=0.0.0.0`, fixing Render port detection when `HOST` is not explicitly set.
- API CORS origin matching now normalizes trailing slashes.
- Added `GET /` so Render/default provider root probes return `200`.
- Added `GET /ready` to report whether Supabase backend env vars are configured.
- Added a backend hosting checklist with local, staging, Vercel, health check, and remaining production-gap notes.
- Updated the API README to match the current backend scope.

Remaining follow-up:

- Run signed-in browser smoke tests against the staging backend after deploy.
- Add provider-specific build/start config once Render, Fly.io, Railway, or another host is selected.
- Do not call the backend production-ready until the local engine validates backend session intent or the architecture explicitly keeps local pairing as the authority.

### Local Pairing Backend Model

Implemented: 2026-05-26

Implemented in:

- `services/api/src/routes/localPairings.ts`
- `services/api/src/server.ts`
- `apps/web/src/features/local-engine/EnginePairingPanel.tsx`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/lib/engineAuth.ts`
- `apps/web/src/lib/engineConfig.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/pages/user/LocalVault.tsx`
- `apps/web/src/pages/user/Player.tsx`
- `.context/current-infrastructure.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added authenticated backend local pairing endpoints.
- Backend local pairing records store engine URL and pairing metadata only.
- Desktop pairing tokens remain in browser `localStorage`; the backend does not receive them.
- Replaced prompt-only token entry with an explicit local engine pairing panel.
- Local Vault now shows the pairing panel before uploads/lists and disables uploads until paired.
- Player now shows the pairing panel when no local engine token exists.
- WebRTC retries connection when pairing state changes.
- Engine URL can be overridden per browser through local storage, while `VITE_ENGINE_URL` remains the default.

Remaining follow-up:

- Browser-smoke the hosted frontend with the desktop engine running.
- Add cleanup/audit behavior later if pairing history becomes useful.

### Stream Metrics Ingestion

Implemented: 2026-05-26

Implemented in:

- `services/api/src/routes/metrics.ts`
- `services/api/src/server.ts`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `POST /metrics/stream`.
- Added authenticated `GET /metrics/stream/recent` for recent user-scoped persisted snapshots.
- Backend validates FPS, bitrate, packet loss, jitter, ICE state, peer connection state, session id, and timestamp.
- Backend rate-limits metrics per user/session to one accepted sample every five seconds.
- React keeps polling `getStats()` every second for the local developer telemetry UI.
- React sends backend stream metrics at most once every five seconds.
- React disables metric sending quietly for unsigned sessions or unavailable API auth config.

Remaining follow-up:

- Browser-smoke a signed-in stream and confirm the live API receives accepted metrics.
- Add retention cleanup or move high-volume metrics to a time-series/log pipeline when traffic grows.

### Target Tree Move

Implemented: 2026-05-26

Implemented in:

- `apps/web/`
- `apps/desktop/`
- `engine/runtime/`
- `services/api/`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/refurbishment-execution-plan.md`
- `.context/suggestions.md`

What changed:

- Moved the React app from `web_server/` to `apps/web/`.
- Moved the Electron desktop launcher from `app_server/` to `apps/desktop/`.
- Moved the Docker engine runtime from `app_server/` to `engine/runtime/`.
- Added `engine/runtime/package.json` so the Docker runtime has its own Node dependency manifest.
- Updated the desktop launcher to build the Docker image from `engine/runtime`.
- Added focused README files for web, desktop, and engine runtime.
- Refreshed package metadata after the move.

Remaining follow-up:

- Runtime-smoke the desktop app and Docker engine after the move.
- Move shared contracts to `packages/shared` after API/web payloads settle.
- Remove any leftover ignored generated artifacts under the old folder names when convenient.

### Desktop Docker Lifecycle States

Implemented: 2026-05-27

Implemented in:

- `apps/desktop/main.js`
- `apps/desktop/preload.js`
- `apps/desktop/index.html`
- `apps/desktop/README.md`
- `engine/runtime/README.md`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added structured desktop engine lifecycle events for checking Docker, pulling image, building image, removing stale containers, starting container, waiting for health, ready, stopping, stopped, and failed.
- Updated the desktop UI to show those lifecycle states instead of one generic booting state.
- Added optional prebuilt image support through `PIXELATED_ENGINE_IMAGE` and `PIXELATED_ENGINE_PULL=1`.
- Kept local image building as the default developer path.
- Added pull-to-build fallback behavior, with `PIXELATED_ENGINE_BUILD_FALLBACK=0` available for packaged releases that should fail instead of building locally.
- Added Docker image reference validation before shelling out to Docker.

Remaining follow-up:

- Publish a real versioned engine image to a registry and set production desktop packaging env vars to pull it.
- Runtime-smoke the desktop app with both default local build mode and prebuilt image pull mode.

### Backend-Issued WebRTC ICE Config

Implemented: 2026-05-27

Implemented in:

- `services/api/src/routes/webrtc.ts`
- `services/api/src/server.ts`
- `services/api/src/config/env.ts`
- `services/api/src/webrtc.test.ts`
- `services/api/.env.example`
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/lib/webrtcPeer.ts`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/runtime/processManager.js`
- `engine/runtime/camera.py`
- `engine/runtime/README.md`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/backend-hosting-checklist.md`
- `.context/suggestions.md`

What changed:

- Added authenticated `GET /webrtc/ice-servers`.
- API returns configured STUN URLs and can issue coturn REST-style short-lived TURN credentials when `TURN_URLS` and `TURN_SHARED_SECRET` are configured.
- API also supports static TURN credentials through `TURN_STATIC_USERNAME` and `TURN_STATIC_CREDENTIAL`.
- React loads ICE config before creating `RTCPeerConnection`, with a Google STUN fallback when the API is unavailable or the user is unsigned.
- React forwards the same ICE config in `start-game`.
- Node validates ICE server payloads and forwards only URL, username, and credential fields into `camera.py`.
- Python configures GStreamer `webrtcbin` with the matching STUN/TURN servers before answering the WebRTC offer.
- Added tests for default ICE config and coturn REST credential generation.

Remaining follow-up:

- Configure a real TURN provider on Render with `TURN_URLS` and `TURN_SHARED_SECRET`, or static TURN credentials if the provider does not support REST credentials, before relying on relay behavior in production.

### API Test Folder Consolidation

Implemented: 2026-05-27

Implemented in:

- `services/api/tests/controlPlane.test.ts`
- `services/api/tests/dataBoundary.test.ts`
- `services/api/tests/webrtc.test.ts`
- `services/api/package.json`
- `services/api/README.md`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Moved API `.test.ts` files out of `services/api/src/` and into `services/api/tests/`.
- Updated the API test script to run `tsx --test "tests/**/*.test.ts"`.
- Updated relative test imports to reference `../src/...`.

Remaining follow-up:

- Keep new API tests in `services/api/tests/` so route/source folders stay easier to scan.

### WebRTC Retry And Failure Recovery

Implemented: 2026-05-27

Implemented in:

- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/features/player/StreamStage.tsx`
- `apps/web/src/pages/user/Player.tsx`
- `.context/current-infrastructure.md`
- `.context/suggestions.md`

What changed:

- Added a player retry action for stream errors.
- Retrying creates a fresh WebRTC session id, clears stale telemetry/metrics timers, and restarts local engine negotiation without leaving the player page.
- WebRTC connection `failed` state now moves the player into an actionable error state.
- WebRTC `disconnected` state gets a short grace period before surfacing an error, reducing flicker during brief network changes.
- Local engine connection failures and rejected pairing tokens now set clearer player-facing error messages.

Remaining follow-up:

- Runtime smoke is tracked in the manual validation section because it requires Docker Desktop and an interactive player session.

### WebRTC Stream Profiles

Implemented: 2026-05-27

Implemented in:

- `apps/web/src/lib/streamProfiles.ts`
- `apps/web/src/lib/useWebRTC.ts`
- `apps/web/src/features/player/PlayerControls.tsx`
- `apps/web/src/pages/user/Player.tsx`
- `engine/runtime/src/signaling/startGameHandlers.ts`
- `engine/runtime/src/signaling/startGameHandlers.test.js`
- `engine/runtime/src/runtime/processManager.js`
- `engine/runtime/camera.py`
- `engine/runtime/README.md`
- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/suggestions.md`

What changed:

- Added stream profile presets: Performance, Balanced, and Quality.
- The player UI exposes profile selection and persists it in `localStorage`.
- React forwards selected profile bitrate and framerate in `start-game`.
- The local engine validates profile id, fps, and bitrate before using them.
- Node passes the sanitized profile to `camera.py` as `PIXELATED_STREAM_PROFILE`.
- Python applies the profile to GStreamer capture framerate and VP8 target bitrate.
- Engine tests cover stream profile validation/clamping.

Remaining follow-up:

- Automated validation is complete. Runtime smoke is tracked in the manual validation section because it requires Docker Desktop and an interactive player session.

## Manual Validation Items

These are not active code implementation tasks. They require an interactive browser session, a signed-in user, Docker Desktop running, or a real TURN provider.

### Signed-In Hosted Smoke Coverage

Status: external/manual validation.

The live API health, readiness, protected-route, CORS, deployed bundle, and Docker engine smoke checks passed after the latest deploys. The remaining hosted smoke path requires a real signed-in browser session.

Smoke checklist:

- Hosted Vercel app can call `GET /me` on Render after login.
- Cloud play creates a backend session and the engine verifies it.
- Local pairing metadata saves through `/local-pairings`.
- Stream metrics post to `/metrics/stream` during active play.
- Comment reporting and play-count increments work through the API.

### WebRTC Runtime Smoke

Status: ready for interactive smoke. Docker Desktop is reachable from the CLI as of 2026-05-27; the remaining checks require launching the desktop app and using the browser player.

Smoke checklist:

- Start Docker Desktop.
- Launch the desktop app.
- Start a player session.
- Stop/restart the desktop engine during playback and verify the retry button recovers.
- Switch Performance, Balanced, and Quality profiles and compare received FPS/bitrate in developer telemetry.
- If a TURN provider is configured, smoke from a network where direct/STUN connectivity fails and confirm relay candidates appear in WebRTC stats.

## Highest Priority Issues

### 1. Decide Explicit LAN Support

The local engine now defaults to host loopback, has an explicit desktop LAN mode for testing, the React pairing panel understands LAN URLs, and the engine has a lobby/role foundation. LAN streaming is tracked as a dedicated multiplayer feature plan in `.context/lan-multiplayer-plan.md`.

Recommended next implementation slice:

- Validate Phase 5 multi-viewer WebRTC behavior with two browser clients against one engine session.
- Add React lobby UI and guest join/invite UX once the media fanout behavior is understood.
- Decide the local HTTPS/private-network strategy because Chrome blocked hosted Vercel to HTTP LAN engine fetches with `LocalNetworkAccessPermissionDenied`.
- Runtime-smoke true two-device LAN once the browser transport decision is made.

## Database And Supabase Suggestions

### Keep Supabase For These

- Auth.
- Persistence for profiles and social graph behind the API.
- Persistence for game metadata behind the API.
- Persistence for comments/reactions/favorites behind the API.
- Admin dashboard persistence behind the API.
- Storage buckets for public covers/banners and approved ROMs.

### Move Or Gate These Through Backend Over Time

- Game submissions.
- Admin actions.
- Access logging.
- Play-count increments.
- ROM URL resolution.
- Favorites, reactions, comments, profile updates, admin users, and admin access-log reads are now routed through the API; keep them there.
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
- Direct Supabase table/RPC/realtime calls have been removed from `apps/web/src`; keep future app data access behind `apps/web/src/lib/apiClient.ts` or small hooks/modules built on top of it.
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

The refurbishment batch is no longer paused; the current tree and plan are tracked in:

- `.context/target-architecture-refurbishment.md`
- `.context/refurbishment-execution-plan.md`

Recommended next work after review:

1. Redeploy the API with the persisted control-plane state changes.
2. Add API tests around session create/verify/expiry/ownership and metric rate limiting.
3. Add retention cleanup for expired sessions and old metrics.
4. Then move admin report actions through the backend.
