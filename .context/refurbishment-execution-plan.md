# Refurbishment Execution Plan

Last reviewed: 2026-05-25

Purpose: convert the target architecture into a step-by-step implementation path. The first backend target is a localhost API server for testing, not hosted deployment.

## Guiding Rules

- Keep the current app working after every step.
- Prefer extraction before folder moves.
- Add the backend in parallel before routing important flows through it.
- Keep the local desktop engine path alive during the transition.
- Do not introduce Redis, hosted engine allocation, or deployment complexity until the localhost backend proves the core contracts.

## Phase 0: Stabilize The Current Checkpoint

Goal: make sure the current tree is understandable before bigger movement.

1. Review pending git changes and decide whether to commit or checkpoint them.
2. Keep `.context/current-infrastructure.md`, `.context/project-flows.md`, `.context/suggestions.md`, and `.context/target-architecture-refurbishment.md` as the current reference set.
3. Confirm web checks still pass:
   - `cd web_server && npm run lint`
   - `cd web_server && npm run build`
4. Confirm engine syntax checks still pass:
   - `node --check app_server/server.js`
   - `python3 -c "import ast, pathlib; ast.parse(pathlib.Path('app_server/camera.py').read_text())"`

Exit criteria:

- Current behavior is not intentionally changed.
- Baseline checks are known.

## Phase 1: Split The Local Engine Server In Place

Status: completed 2026-05-25.

Goal: reduce `app_server/server.js` before adding backend complexity.

Target temporary structure:

```text
app_server/
  server.js
  src/
    config.js
    http/
      healthRoutes.js
      localVaultRoutes.js
      errorHandlers.js
    signaling/
      socketAuth.js
      sessionRooms.js
      signalingRelay.js
      inputHandlers.js
      engineErrorHandlers.js
    runtime/
      processManager.js
    roms/
      cloudRomDownloader.js
      localRomStore.js
    input/
      translateKey.js
      injectKey.js
    telemetry/
      healthSnapshot.js
```

Steps:

1. Done: extracted config constants from `server.js` into `app_server/src/config.js`.
2. Done: extracted token validation and Socket.IO auth into `signaling/socketAuth.js`.
3. Done: extracted session room helpers into `signaling/sessionRooms.js`.
4. Done: extracted health snapshot logic into `telemetry/healthSnapshot.js`.
5. Done: extracted Local Vault routes into `http/localVaultRoutes.js`.
6. Done: extracted cloud ROM URL validation/download into `roms/cloudRomDownloader.js`.
7. Done: extracted process lifecycle into `runtime/processManager.js`.
8. Done: kept virtual display startup inside `runtime/processManager.js` for now because it shares process handles with health/runtime state.
9. Done: extracted key translation and input injection into `input/`.
10. Done: left `server.js` as a composition/root file that wires Express, routes, Socket.IO, and runtime services.

Exit criteria:

- Done: `app_server/server.js` is mostly wiring.
- Needs manual runtime smoke test: Local Vault still works.
- Needs manual runtime smoke test: WebRTC local session still works.
- Done: same syntax checks from Phase 0 pass.

## Phase 2: Split The Player Page In Place

Status: completed 2026-05-25.

Goal: reduce `Player.tsx` before routing flows through the API.

Target temporary structure:

```text
web_server/src/features/player/
  StreamStage.tsx
  StreamTelemetryPanel.tsx
  PlayerHeader.tsx
  PlayerControls.tsx
  ReactionButtons.tsx
  useAuthUser.ts
  useGameMetadata.ts
  useGameReactions.ts
  usePlayCount.ts
  comments/
    CommentsPanel.tsx
    CommentForm.tsx
    CommentItem.tsx
    useComments.ts
    useCommentReporting.ts
```

Steps:

1. Done: moved video/stream display UI into `StreamStage.tsx`.
2. Done: moved telemetry panel into `StreamTelemetryPanel.tsx`.
3. Done: moved top title/status/back UI and telemetry toggle into `PlayerHeader.tsx`.
4. Done: moved game metadata query into `useGameMetadata.ts`.
5. Done: moved likes/dislikes into `useGameReactions.ts` and `ReactionButtons.tsx`.
6. Done: moved play-count timer into `usePlayCount.ts`.
7. Done: moved comments/reporting into `comments/`.
8. Done: kept `web_server/src/pages/user/Player.tsx` as a thin route component.

Exit criteria:

- Done: `Player.tsx` is mostly composition.
- Done: UI behavior is intended to remain unchanged.
- Done: `cd web_server && npm run lint && npm run build` passes.

## Phase 3: Create Localhost Backend Skeleton

Status: completed 2026-05-25.

Goal: add the backend service without changing production flows yet.

Target structure:

```text
services/
  api/
    src/
      server.ts
      config/env.ts
      plugins/
        cors.ts
        logger.ts
      routes/
        health.ts
        me.ts
      modules/
        auth/
          supabaseAuth.ts
      types/
    package.json
    tsconfig.json
    .env.example
```

Recommended localhost defaults:

```text
API URL: http://127.0.0.1:4000
Health:  GET http://127.0.0.1:4000/health
```

Steps:

1. Done: created `services/api` with Node.js, TypeScript, Fastify, Zod, pino, and Supabase client dependencies.
2. Done: added `GET /health` returning service name, uptime, and environment.
3. Done: added `.env.example` with:
   - `PORT=4000`
   - `HOST=127.0.0.1`
   - `SUPABASE_URL=`
   - `SUPABASE_ANON_KEY=`
   - `SUPABASE_SERVICE_ROLE_KEY=`
   - `WEB_ORIGIN=http://localhost:5173`
4. Done: added CORS for local Vite and the hosted Vercel origin.
5. Done: added dev scripts:
   - `npm run dev`
   - `npm run build`
   - `npm run lint`
   - `npm run typecheck`
6. Done: added backend README with local startup instructions.

Exit criteria:

- Done: `cd services/api && npm start` starts on `127.0.0.1:4000` after `npm run build`.
- Done: `GET /health` works.
- Done: no web app behavior depends on it yet.

## Phase 4: Add Backend Auth And Client API Layer

Status: implemented 2026-05-25. Needs a final signed-in smoke test after `services/api/.env` is populated with Supabase credentials.

Goal: prove the web app can call localhost API using Supabase auth.

Backend steps:

1. Done: add Supabase JWT verification middleware.
2. Done: add `GET /me` that returns the authenticated user id/email.
3. Done: add `GET /me/permissions` that reads `profiles` and returns profile role plus abilities.

Frontend steps:

1. Done: add `web_server/src/lib/apiClient.ts`.
2. Done: add `VITE_API_URL=http://127.0.0.1:4000` to `web_server/.env.example`.
3. Done: attach the current Supabase access token as `Authorization: Bearer <token>`.
4. Deferred: add a visible/internal test call only if needed during manual auth smoke testing. The API client is available but no user-facing web behavior depends on it yet.

Exit criteria:

- Needs Supabase env smoke test: signed-in web user can call `GET /me`.
- Needs Supabase env smoke test: signed-out user receives 401 when Supabase auth is configured.
- Done: current Supabase direct flows still work because no user-facing behavior has been routed through the API yet.

## Phase 5: Move Low-Risk Mutations Through Backend

Status: implemented 2026-05-25. Needs final signed-in smoke test after `services/api/.env` is populated with Supabase credentials.

Goal: route server-worthy but low-blast-radius workflows through the API first.

Suggested order:

1. Done: move play-count increments:
   - Backend: `POST /games/:gameId/play-count`
   - Frontend: `usePlayCount` calls API instead of direct RPC.
2. Done: move comment report submission:
   - Backend: `POST /moderation/comments/:commentId/report`
   - Frontend: reporting hook calls API.
3. Deferred: move admin report action later, after permissions are proven:
   - Backend: `POST /admin/reports/:reportId/action`

Exit criteria:

- Done in code: backend verifies user identity through Supabase bearer-token middleware.
- Done in code: backend writes play-count/report mutations with the Supabase service client.
- Done: frontend no longer performs play-count and comment-report mutations directly.
- Needs Supabase env smoke test: signed-in play-count and comment-report flows work against the real database.

## Phase 6: Add Backend Session Creation For Cloud Games

Status: implemented 2026-05-25. Needs final signed-in smoke test after `services/api/.env` is populated with Supabase credentials.

Goal: stop the browser from resolving cloud ROM URLs directly for normal cloud play.

Backend endpoint:

```text
POST /sessions
Body: { gameId: string, mode: "cloud" | "local" }
Returns: {
  sessionId: string,
  sessionToken: string,
  engineUrl: string,
  boot: {
    romUrl?: string,
    romFilename?: string
  },
  expiresAt: string
}
```

Localhost-first behavior:

- For now, `engineUrl` can still be `http://localhost:8080`.
- The backend resolves `gameId` to `rom_url || rom_filename`.
- The backend creates a short-lived signed session token.
- The browser sends the session token to the local engine.
- The local engine can initially trust the backend-created payload, then later validate tokens against the backend.

Steps:

1. Done: add `sessions` module in `services/api`.
2. Done: add session id/token generation.
3. Done: keep sessions in memory for the first localhost proof.
4. Done: move cloud `resolveGameBootTarget()` ROM lookup from React into backend.
5. Done: update `useWebRTC` to request a session before cloud `start-game`.
6. Done: keep Local Vault `.nes` mode compatible with the existing local path.

Exit criteria:

- Done in code: cloud game boot no longer queries `games.rom_url` directly from React.
- Done in code: React receives a backend session response and keeps using the current browser session id during the transition.
- Needs runtime smoke test: existing local engine still streams after the session route change.

## Phase 7: Add Local Pairing To Backend Model

Goal: make local engine pairing a first-class concept rather than prompt-only browser state.

Possible localhost model:

```text
POST /local-pairings
Body: { engineToken, engineUrl }
Returns: { pairingId, status }
```

Steps:

1. Add backend module `local-pairing`.
2. Let authenticated users store a local engine endpoint and token locally or server-side.
3. Replace prompt-only token entry with a cleaner pairing panel in the web app.
4. Keep token storage cautious: local-only storage is safest for the desktop token unless there is a strong reason to sync it.

Exit criteria:

- Pairing UX is explicit.
- Backend knows whether a user intends local engine mode.
- Secret handling decision is documented.

## Phase 8: Metrics Ingestion

Goal: turn browser-only telemetry into backend-visible telemetry.

Backend endpoint:

```text
POST /metrics/stream
Body: {
  sessionId,
  fps,
  bitrateKbps,
  packetsLost,
  jitterMs,
  iceConnectionState,
  connectionState,
  timestamp
}
```

Steps:

1. Add `metrics` module to backend.
2. Accept telemetry snapshots at a low rate, for example every 5 or 10 seconds.
3. Store only useful sampled records, not every browser poll.
4. Add basic validation and rate limiting.

Exit criteria:

- Telemetry remains visible in the dev toggle.
- Backend can collect enough data for debugging without flooding Supabase.

## Phase 9: Move To Target Tree

Goal: rename folders only after boundaries are proven.

Steps:

1. Move `web_server` to `apps/web`.
2. Move Electron orchestration from `app_server` to `apps/desktop`.
3. Move engine runtime from `app_server` to `engine/runtime`.
4. Move shared API/session/telemetry contracts to `packages/shared`.
5. Update import paths, package scripts, README docs, and deployment notes.

Exit criteria:

- Root repo shape matches `.context/target-architecture-refurbishment.md`.
- Each app/service can run from its own package.

## Phase 10: Hosting Prep

Status: staging-host ready as of 2026-05-26. Local env file, CORS origin normalization, readiness checks, Render-compatible `0.0.0.0` production binding, root probe response, and hosting checklist are in place. Supabase env presence was verified through `/ready`; signed-in browser smoke tests should run immediately after staging deploy.

Goal: prepare deployment after localhost backend works.

Render backend prep:

1. Pending: add Dockerfile or Render build/start commands for `services/api`.
2. Done: `GET /health` exists as the liveness check.
3. Done: `GET /ready` reports whether required backend env vars are configured.
4. Done locally: created `services/api/.env`; still needs Supabase keys filled by project owner.
5. Done: CORS allows Vercel and local dev, with trailing slash normalization.
6. Pending: configure env vars in the chosen host.
7. Later: add Redis only when sessions/rate limits need shared state.

Future engine fleet prep:

1. Add engine-node heartbeat endpoint.
2. Add node capacity state.
3. Add session assignment.
4. Evaluate Fly.io Machines, ECS, Kubernetes, or dedicated GPU hosts.

Exit criteria:

- Backend can deploy independently from web.
- Web can switch API URL by env var.

## Immediate Next Task Recommendation

Start with Phase 1, step 1:

Extract `app_server/server.js` config constants into `app_server/src/config.js`, then continue splitting one responsibility at a time.

Reason: it lowers risk before introducing the backend, and it attacks the biggest file that will otherwise make every later backend/session change harder.
