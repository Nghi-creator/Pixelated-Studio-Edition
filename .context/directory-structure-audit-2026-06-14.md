# Directory Structure Audit

Reviewed: 2026-06-14

Scope: repository layout, module ownership, file grouping, generated artifacts,
and navigation clarity. This audit does not propose product features.

## Overall Assessment

The top-level structure is clean and should remain stable:

```text
apps/        user-facing web and desktop applications
engine/      local game-streaming runtime
services/    hosted backend services
supabase/    database migrations and templates
scripts/     repository-level smoke and maintenance tooling
assets/      repository documentation assets
.context/    architecture, plans, audits, and smoke evidence
```

TypeScript `.ts` and `.tsx` files should remain mixed inside feature folders.
Use `.tsx` only when a module contains JSX; grouping by product ownership is
more useful than grouping by file extension.

## Implemented In This Pass

### Web Shared Infrastructure

The former flat `apps/web/src/lib/` directory mixed authentication, engine
connection, and WebRTC infrastructure. It is now grouped by runtime ownership:

```text
apps/web/src/lib/
  auth/       Supabase client, password policy, auth-scoped cache helpers
  engine/     engine URL/token state, stream profiles, connection hooks
  webrtc/     peer/session/input/telemetry helpers and the shared WebRTC hook
  apiClient.ts
  appUrl.ts
  requestLifecycle.ts
  useSessionTracker.ts
```

Feature-owned UI and hooks remain under `apps/web/src/features/`. This keeps
reusable runtime infrastructure separate from player and pairing presentation.

### Context Navigation

Added `.context/README.md` as the documentation entry point. It distinguishes
current sources of truth, active checklists, planning references, and historical
evidence.

### Oversized Web Modules

Completed `STRUCTURE-01`. Large web modules now delegate stable responsibilities
to feature-owned components, hooks, contracts, and pure helpers:

- Local-engine pairing separates LAN preflight UI, pairing contracts, and URL
  classification helpers.
- Multiplayer separates invite parsing and game-card presentation.
- Profile separates avatar-crop logic and modal presentation.
- The shared WebRTC and API layers expose contracts from focused modules.

### Desktop Controller Ownership

Completed `STRUCTURE-02`. The desktop composition roots retain lifecycle and
request orchestration while focused modules own their domain logic:

```text
apps/desktop/main/
  companion/
    certificate.ts   certificate creation and reuse
    inviteState.ts   invite, launch-ticket, and guest-token state
    proxy.ts         authenticated HTTP and WebSocket engine proxying
    statusPage.ts    companion status-page response
  engine/
    launch.ts        launch context, invites, and Docker run arguments
  companionServer.ts HTTPS server and request composition
  engineController.ts engine lifecycle composition
```

## Keep As-Is

### API Route Registry

`services/api/src/routes/` is flat but still readable at 15 route modules.
Moving each route into a folder without first separating schemas, services, and
storage logic would add nesting without reducing complexity.

### Engine Runtime

`engine/runtime/src/` already has strong domain folders for HTTP, input, ROMs,
runtime processes, sessions, signaling, and telemetry. Keep tests colocated
with engine modules because they validate those internal contracts.

### Supabase Migrations

Keep migrations in one chronological directory. Grouping them by feature would
break the primary ordering model and make deployment history harder to inspect.

## Staged Cleanup Plan

Work these as focused refactors with behavior-preserving tests, not bulk moves.

### STRUCTURE-03 — Decompose API Domains Before Nesting Routes

Start with `routes/catalog.ts` and `routes/moderation.ts`. Extract validation,
query/service logic, and route registration into domain-owned modules. Preserve
the flat route registration surface in `server.ts`.

### STRUCTURE-04 — Group Root Smoke Tooling

When the next smoke-tool change is needed, group:

```text
scripts/hosted/
scripts/lan/
```

Move tests beside their scripts and update package commands and documentation in
the same change. Avoid a standalone move because these scripts are referenced by
operational checklists and command examples.

### STRUCTURE-05 — Normalize Remaining Source Anomalies

- Convert `engine/runtime/src/signaling/startGameHandlers.test.js` to TypeScript
  when that signaling suite is next modified.
- Keep generated directories ignored and out of reviews: `dist/`, `release/`,
  `.vercel/`, `__pycache__/`, `supabase/.temp/`, and local hosted-smoke output.
- Periodically remove local generated directories if editor navigation becomes
  noisy; do not commit them.

## Guardrails

- Do not create folders that contain only one file unless ownership is clearer.
- Do not move files solely to make directory trees symmetrical.
- Keep tests colocated for internal engine modules and in package-level test
  folders for integration/boundary tests.
- Prefer domain names (`auth`, `engine`, `webrtc`) over generic names such as
  `helpers`, `common`, or `utils`.
- Perform large-file decomposition separately from folder moves so regressions
  remain easy to review.
