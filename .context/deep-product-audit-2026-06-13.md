# Deep Product Audit and Optimization Tracker

Started: 2026-06-13

Scope: frontend, API backend, Electron desktop, Docker engine runtime, Supabase
migrations, repository checks, and smoke tests. This work improves the existing
product and infrastructure; it does not introduce new product features.

## How To Use This File

- **Current Status** is the quick project-health snapshot.
- **Next Work Queue** is the ordered backlog for future optimization passes.
- **Completed Work Ledger** records what changed and how it was verified.
- **Deployment Actions** lists completed code that is not active until deployed.
- **Known Environment Gaps** records tests that cannot be fully proven locally.
- Update this file after each optimization pass. Move finished queue items into
  the completed ledger instead of deleting their history.

## Current Status

| Area | Status | Summary |
| --- | --- | --- |
| Web frontend | Healthy, focused coverage added | Lint, production build, and 10 lifecycle regression contracts pass; broad visual component coverage remains optional follow-up work. |
| API backend | Hardened, more work queued | Public account enumeration is closed, reactions are atomic, and write-heavy routes have per-user limits; shared-store limits remain. |
| Desktop | Healthy | Build, 39 tests, companion security controls, and packaged-app smoke pass. |
| Engine runtime | Healthy | Build, syntax checks, 28 tests, and live Docker boot smoke pass. |
| Docker image | Hardened and reduced | Pinned multi-stage build passes live ROM smoke at `1.15GB`; build tools are absent from the runtime image. |
| Supabase | Deployed | Security-definer hardening and atomic-reaction migrations were applied to the hosted database. |

## Next Work Queue

Work these in order unless a production incident changes priority.

### NEXT-04 — P1: Move API Abuse Controls to a Shared Store

**Problem**

Session verification, submissions, metrics, LAN invite redemption, reports,
play-count writes, comments, and reactions have focused throttles. In-memory
limits reset on process restart and do not coordinate across multiple API
instances.

**Recommended work**

- Use a shared rate-limit store before horizontally scaling the API.

**Done when**

- Write-heavy routes have documented limits and regression tests.
- Limits behave consistently across multiple API instances.

### NEXT-06 — P1: Replace Shell-Composed Process Calls

**Problem**

Desktop Docker orchestration and engine keyboard injection still use shell
commands through `exec`. Inputs are mostly validated or allowlisted, but
argument-array `spawn`/`execFile` calls reduce quoting risk and improve
cross-platform behavior.

**Done when**

- Practical process calls use argument arrays.
- Existing desktop and engine behavior remains covered by tests.

### NEXT-07 — P1: Complete Real Integration Proof

**Still requires target environments**

- Signed-in hosted browser flows against Render/Supabase.
- Real two-device LAN stream and certificate UX.
- P3/P4 `/dev/uinput` behavior on a target Linux host.
- Packaged installer smoke on each native OS.
- TURN relay behavior where direct/STUN connectivity fails.

## Deployment History

### DEPLOY-01 — Apply Supabase Security-Definer Hardening

**Status:** Deployed to the hosted database on 2026-06-13.

Migration:
`supabase/migrations/20260613150000_harden_security_definer_functions.sql`

### DEPLOY-02 — Apply Atomic Reaction Functions Before the API Release

**Status:** Deployed to the hosted database on 2026-06-13.

Migration: `supabase/migrations/20260613210000_atomic_reaction_writes.sql`

## Completed Work Ledger

### DONE-01 — Prevent Cross-User Session Overwrite

**Problem:** `POST /sessions` used a service-role upsert with a browser-supplied
session ID, allowing a known active ID to be reassigned.

**Resolution:** Session creation is insert-only. Active duplicates and uniqueness
races return `409`.

**Verification:** Regression test proves another user's active session remains
unchanged.

### DONE-02 — Prevent Desktop Log HTML Injection

**Problem:** Docker/runtime output was appended to the Electron renderer through
`innerHTML`.

**Resolution:** Logs now render as text nodes; presentation wrappers are removed
before display.

**Verification:** Desktop package tests reject reintroducing `innerHTML`
assignment.

### DONE-03 — Surface API Mutation Storage Failures

**Problem:** Favorite, reaction, comment, pairing, lobby, and session mutations
could discard Supabase errors and still report success.

**Resolution:** Affected routes log storage failures and return `500`;
idempotent missing-resource behavior is preserved.

**Verification:** API route and data-boundary regression tests pass.

### DONE-04 — Close Admin Target-Authorization Fail-Open

**Problem:** The super-admin update route ignored target-role lookup errors and
could continue after a partial database failure.

**Resolution:** Target-role lookup failures stop the request with `500`.

**Verification:** Existing self-modification and super-admin protections plus
new failure-path tests pass.

### DONE-05 — Fix Invite Pairing Initialization

**Problem:** Companion invite initialization synchronously changed multiple state
values from a mount effect and failed the React cascading-render lint rule.

**Resolution:** Invite URL, mode, and preflight state now use lazy state
initializers; the redundant mount effect was removed.

**Verification:** Web lint and production build pass.

### DONE-06 — Add Focused Abuse Controls

**Problem:** Session-token verification and desktop LAN invite redemption
accepted unlimited attempts. The former account lookup endpoint also lacked
throttling before it was converted into a constant-response compatibility shim.

**Resolution:** Added a bounded fixed-window API limiter, IP/session limits for
verification, and temporary `429` responses for repeated invalid LAN invite
attempts.

**Verification:** API limiter and route tests plus desktop companion tests pass.

**Remaining risk:** API limits are process-local. See `NEXT-04`.

### DONE-07 — Prepare Supabase Security-Definer Hardening

**Problem:** Legacy play-count, account-delete, and signup-profile functions did
not fully fix `search_path` or consistently restrict execution grants.

**Resolution:** Added a forward migration using an empty `search_path`, fully
qualified objects, restricted browser-role execution, and retained service-role
play-count access.

**Verification:** Migration reviewed against current API boundaries.

**Remaining action:** Apply the migration. See `DEPLOY-01`.

### DONE-08 — Return Correct Engine CORS Errors

**Problem:** Rejected origins correctly failed access control but returned `500`,
making expected rejection look like a runtime failure.

**Resolution:** Rejected origins now return a generic `403`; unexpected errors
continue returning generic `500` responses.

**Verification:** Engine HTTP error tests and live allowed/disallowed-origin
smoke pass.

### DONE-09 — Improve Docker Build Reproducibility and Size

**Problem:** The engine image cloned the latest Mesen source, used `npm install`,
kept apt metadata, and included unused packages.

**Resolution:** Pinned Mesen to
`0102910c39ad1a62bc3f784466f3f67ca9eae335`, switched to `npm ci`, cleaned apt
metadata, and removed unused dependencies.

**Verification:** Exact hardened image built successfully as
`pixelated-engine:audit-final` at `1.96GB`, down from the existing `2.06GB`
image. See `NEXT-05` for remaining image work.

### DONE-10 — Remove Public Account Enumeration

**Problem:** `POST /auth/account-methods` disclosed account existence and linked
providers while scanning up to 10,000 Supabase Auth users per request.

**Resolution:** Removed the web client's dependency on account discovery.
Signup and password-reset flows now call the appropriate Supabase operation
directly and show uniform responses that do not reveal account state. The API
route remains temporarily as a constant-response compatibility shim for older
hosted and packaged clients; it performs no account lookup.

**Verification:** API regression coverage proves existing and missing accounts
receive the same response without calling `listUsers`; web lint and production
build pass.

### DONE-11 — Make Reaction Replacement Atomic

**Problem:** Game and comment reaction routes deleted the prior reaction before
inserting its replacement, so a failed insert could erase valid state.

**Resolution:** Added service-role-only `set_game_reaction` and
`set_comment_reaction` database functions. Each request now performs one atomic
delete or `INSERT ... ON CONFLICT DO UPDATE` operation.

**Verification:** API failure-case tests prove failed game and comment reaction
writes preserve the previous reaction.

**Deployment:** Atomic reaction functions were applied to the hosted database.

### DONE-12 — Add Focused Frontend Regression Coverage

**Problem:** The web package relied on lint/build and hosted smoke tests without
local contracts for high-risk lifecycle behavior.

**Resolution:** Added dependency-free Node contracts for companion invite
initialization and failures, API timeout/abort cleanup, comment pagination,
auth-state cache clearing, WebRTC retry identity, and WebRTC telemetry cleanup.
The cross-platform release workflow now runs the web contracts.

**Verification:** Web test suite passes 10 contracts alongside lint and the
production build.

**Remaining risk:** Visual rendering and full browser interaction still depend
on hosted smoke tests; add component-level browser tests when their maintenance
cost is justified.

### DONE-13 — Add Write-Heavy API Abuse Controls

**Problem:** Authenticated users could generate unbounded report, comment,
reaction, and play-count writes.

**Resolution:** Added conservative per-user limits for reports, comments,
reactions, and play-count writes. Blocked requests return `429` with
`Retry-After` guidance before any storage or RPC write occurs.

**Verification:** API route tests hit each threshold and prove blocked requests
do not create additional rows or RPC calls.

**Remaining risk:** Limits are process-local. See `NEXT-04`.

### DONE-14 — Create a Pinned Multi-Stage Engine Image

**Problem:** The engine runtime image retained compilers, Git, `npm`, `pip`,
TypeScript sources, tests, and other build-only artifacts. Node installation
also depended on a mutable remote setup script.

**Resolution:** Split Mesen compilation, Python dependency installation, Node
compilation, and runtime packaging into separate stages. Ubuntu and Node base
images, Node version, and Mesen source are digest/version pinned. The final image
contains only runtime packages, compiled application code, production Node
modules, Python runtime dependencies, scripts, and the Mesen core. Added a
`.dockerignore` to exclude local build output and caches.

**Verification:** Clean image build and live ROM boot smoke passed. Runtime
health, token rejection/acceptance, CORS rejection, virtual display, audio,
RetroArch, Mesen, camera bridge, and storage passed. The image is `1.15GB`, down
from the previous hardened `1.96GB`; `npm`, `pip`, Git, `make`, `g++`, and
`curl` are absent from the runtime image.

## Latest Verification Run

Run on 2026-06-13 after the completed hardening work:

| Gate | Result |
| --- | --- |
| Web tests, lint, and production build | Passed — 10 tests |
| API typecheck, lint, build, and tests | Passed — 42 tests |
| Desktop build and tests | Passed — 39 tests |
| Desktop packaged release smoke | Passed |
| Engine build, syntax checks, and tests | Passed — 28 tests |
| Root smoke tooling tests | Passed — 9 tests |
| Live Docker engine health and ROM boot | Passed |
| `git diff --check` | Passed |

## Known Environment Gaps

- Docker Desktop does not expose `/dev/uinput`; the expected two-player keyboard
  fallback was active. Validate P3/P4 on a target Linux host.
- The existing packaged desktop release initially had stale bundled web output.
  Rebuilding refreshed the unpacked app, and its packaged-app smoke passed.
- DMG creation failed in `hdiutil` after electron-builder retries.
- macOS code signing was skipped because no Developer ID identity is installed.
- During live engine smoke, `smoke.nes` booted with RetroArch and camera active.
  The container sampled roughly 413 MiB and 67% CPU; RetroArch reported roughly
  70% average CPU.
- The multi-stage image live smoke sampled roughly 159 MiB and 76% container CPU
  during ROM boot; RetroArch and the camera bridge were active.

## Documentation Follow-Up

`.context/current-infrastructure.md` is the best current infrastructure source
of truth. Parts of `.context/project-flows.md`, `.context/suggestions.md`, older
plans, and the root README describe historical behavior or completed work.
Reconcile them after the higher-priority queue items above.
