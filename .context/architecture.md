# Architecture and Runtime Flows

Last reviewed: 2026-07-22

This is the durable architecture reference for Studio Edition. Historical
implementation plans and audit notes belong in Git history.

## Repository Shape

```text
apps/web/       Vite/React frontend and browser orchestration
apps/desktop/   Electron app, Docker lifecycle, and HTTPS LAN companion
engine/runtime/ Token-gated local engine, emulator runtime, and WebRTC relay
services/api/   Hosted Fastify control plane shared by Studio and User Edition
supabase/       Database migrations, Storage policy, and private RPCs
scripts/        Hosted, LAN, catalog, and interaction smoke tooling
```

Package READMEs own detailed commands and environment variables. This file
records boundaries and cross-package flows.

## Trust and Ownership Boundaries

- `services/api` owns authenticated application data, authorization, catalog
  decisions, session verification, signed private artifact access, metrics,
  moderation, and abuse controls.
- Studio Edition is the migration authority for the Supabase project shared
  with User Edition. User Edition must not repair or push migration history.
- Browser Supabase access is limited to auth/session handling and intentional
  signed-in Storage uploads. Table and RPC workflows go through the API.
- `apps/desktop` owns host-local engine secrets and local/LAN exposure. LAN
  guests receive scoped, revocable companion credentials, never the raw engine
  token.
- `engine/runtime` accepts engine-token or companion-authenticated traffic,
  verifies cloud boot intent with the API, and owns local process/runtime state.
- Public engine health is intentionally minimal. Detailed diagnostics require
  host-level engine authentication.

## Hosted API

The API owns identity and role lookup, catalog and social routes, submissions
and catalog review, cloud sessions, pairing/lobby metadata, stream metrics,
cleanup, ICE configuration, and shared rate limiting.

Important probes:

- `GET /` and `HEAD /` for liveness.
- `GET /health` for dependency/configuration state.
- `GET /ready` for deploy readiness; production requires Supabase and the
  shared Redis-compatible rate-limit store.

The API serves both Studio and User Edition contracts. Browser-capable catalog
artifacts remain private and are exposed through short-lived signed URLs.

## Web App

The web app owns routes, presentation, browser auth orchestration, engine
pairing, WebRTC receiving and input, Local Vault UI, multiplayer UI, research
capture/export, publishing, and admin surfaces.

Hosted application data uses `apps/web/src/lib/api/`. Engine and WebRTC state
remain feature-owned under `apps/web/src/lib/engine/`, `src/lib/webrtc/`, and
`src/features/player/`.

## Desktop and Companion

The desktop app performs Docker diagnostics, builds or pulls the selected
runtime image, creates a per-run token, starts/stops the engine, polls health,
and packages the web app. LAN mode also starts the HTTPS companion, invite
state, launch tickets, QR flow, scoped credential proxy, and client revocation.

Local mode publishes the engine on loopback. LAN exposure is explicit and
publishes through the desktop-controlled companion boundary.

## Engine Runtime

The engine owns Express/Socket.IO endpoints, Local Vault storage, runtime
processes, ROM validation/download, signaling, player slots, input routing,
camera bridge, and health snapshots. Runtime tests live in
`engine/runtime/tests/` and compile into ignored `dist/tests/` output.

Supported launch families include reviewed libretro ROM builds and allowlisted
native Linux manifests. Cloud targets are replaced with API-verified metadata;
browser-supplied targets are not trusted.

## Core Flows

### Engine startup

1. Desktop checks Docker and resolves the requested runtime image.
2. Desktop generates a per-run engine token and removes stale containers.
3. The container starts in local or explicit LAN exposure mode.
4. Desktop polls engine health and publishes ready state.
5. LAN mode starts the companion and invite/launch flows.

### Desktop or LAN pairing

1. Desktop launch pairing creates a one-use ticket; LAN pairing creates a
   short-lived invite code.
2. The browser redeems through the local HTTPS companion.
3. The companion returns a host- or guest-scoped credential.
4. The browser stores the companion URL and scoped credential locally.
5. Signed-in users may persist non-secret pairing metadata through the API.

### Cloud game boot

1. Web requests a cloud session from the API.
2. API requires auth for Studio sessions; User Edition WASM may use a
   rate-limited guest session. It checks rights/build eligibility and records
   approved boot data.
3. Web sends the session token to the paired engine.
4. Engine verifies the session with the API and uses only verified boot data.
5. Engine downloads or resolves the approved artifact and starts the runtime.

### Local Vault boot

1. Web uploads a supported local ROM to the paired engine.
2. Engine validates extension, size, cartridge header, and safe object path.
3. The ROM remains in the local Docker volume and boots without hosted catalog
   publication.

### WebRTC and multiplayer

1. Browser joins an engine session/lobby and requests ICE configuration.
2. Engine starts the game and camera bridge and relays peer-targeted signaling.
3. Browser receives media and sends normalized input for its assigned slot.
4. Only host-eligible clients can control a session; companion guests cannot
   become host or inherit host privileges.
5. Telemetry stays local for export and may also be written as authenticated,
   bounded API metrics.

### Submission and catalog intake

1. A signed-in creator uploads files to their private submissions path.
2. API validates ownership and stores review metadata.
3. Admin review uses short-lived signed submission URLs.
4. Candidate validation checks rights, runtime compatibility, artifact size,
   checksum, and header before promotion.
5. Published private ROMs are signed per session; artwork remains public.

## Durable Principles

- Keep sensitive decisions and shared data behind `services/api`.
- Keep desktop operation local-first and LAN exposure explicit.
- Preserve scoped credentials and least privilege across proxy boundaries.
- Prefer feature-owned modules over generic utility buckets.
- Treat generated smoke bundles, builds, and release output as disposable.
- Add a shared types package only when cross-package duplication outweighs its
  coordination cost.
