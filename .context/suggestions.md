# Suggestions

Last reviewed: 2026-05-24

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

### 3. Harden ROM Downloading

The engine downloads arbitrary `http` URLs received from the browser and boots them. Even if the UI normally sends Supabase URLs, the socket event itself can be spoofed.

Suggested improvements:

- Backend should resolve game id to an approved ROM URL.
- Engine should receive a signed session manifest, not arbitrary URLs from the browser.
- Allow only HTTPS.
- Allow only approved storage hostnames.
- Enforce max download size and timeout.
- Delete temp ROMs after the session ends.

### 4. Improve Docker Build/Run Lifecycle

The Electron app builds the image on demand and uses a fixed container name/port. This is workable for a demo, but fragile for users.

Suggested improvements:

- Build and publish the engine image ahead of time, then `docker pull` tagged versions.
- Keep local build as a development fallback.
- Remove stale containers before running, instead of requiring a second click.
- Use a health check endpoint before showing "engine ready".
- Add structured engine states: checking Docker, pulling/building image, starting container, waiting for health, ready, failed.
- Mount `/roms` as a named volume so local vault survives container replacement.

### 5. Fix WebRTC Production Readiness

Google STUN alone is not enough for real users and varied networks.

Suggested improvements:

- Add TURN support.
- Generate short-lived TURN credentials from the backend.
- Track ICE state and reconnect/fail clearly in the UI.
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

- `useWebRTC` owns socket lifecycle, game lookup, WebRTC setup, and keyboard input. Split this into session boot, signaling, peer connection, and input modules.
- Several Supabase queries/actions are embedded directly in page components. Introduce small data modules/hooks for games, comments, favorites, moderation, and profiles.
- Admin access is checked in UI, but the UI should treat RLS/backend authorization as the source of truth.
- `fetchComments` uses `.range(pageNum * 10, (pageNum + 1) * 10)`, which requests 11 rows because Supabase ranges are inclusive. If the intent is "fetch 11 to detect hasMore", name that explicitly; otherwise use end `pageNum * 10 + 9`.

### Engine

- Session signaling now uses rooms, but the engine still supports only one active RetroArch/camera pair at a time.
- `exec` is used for `xdotool` key events. Current key mapping is allowlisted, which helps, but `spawn` with args would be cleaner.
- `bootGame` kills global processes, so one engine supports one active game at a time. That is fine for a local node, but it should be explicit.
- `startVirtualDisplay` starts Xvfb/PulseAudio without retaining process handles or checking failures.
- Cloud temp ROMs are created but not cleaned up after normal session end.

### Docker

- `RUN npm install express socket.io cors` before copying `package*.json` duplicates dependency installation and weakens caching discipline.
- The image compiles Mesen from GitHub at build time. Pin commits/tags for reproducible builds.
- Consider multi-stage builds or a prebuilt engine image. Current image is likely large and slow to build.
- `pulseaudio --system` is generally awkward operationally; document why it is used and capture logs/exit status.

### Repository Hygiene

- `node_modules`, `dist` installer artifacts, `.DS_Store`, and Supabase `.temp` files appear in the working tree. They should not be committed unless there is a very deliberate reason.
- Consider separate READMEs for web app, desktop app, and engine internals.
- Add `.env.example` files for the web and engine.

## Scaling Roadmap

### Phase 0: Stabilize Current Demo

- Add `.context` docs.
- Add engine health endpoint.
- Add stale container cleanup before run.
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

If you approve the direction, I would start with this batch:

1. Add `/health` endpoint and improve Electron startup state.
2. Clean repo ignores for generated files.
3. Refactor `useWebRTC` into smaller session boot, signaling, peer connection, and input modules.
4. Add cloud ROM URL allowlisting, max download size, timeout, and temp-file cleanup.

This batch makes the current architecture more coherent without forcing a full backend migration yet.
