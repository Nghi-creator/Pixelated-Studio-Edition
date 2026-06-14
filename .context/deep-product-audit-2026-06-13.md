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
| Web frontend | Healthy, focused coverage added | Lint, production build, 31 lifecycle regression contracts, and the rendered interaction harness pass; shared infrastructure and large feature modules are grouped by ownership. |
| API backend | Hardened and deployed | Public account enumeration is closed, reactions are atomic, production abuse controls use shared Redis counters, and catalog/moderation logic is grouped by domain ownership. |
| Desktop | Healthy | Build, 45 tests, decomposed companion/launch ownership, companion security controls, shell-safe Docker orchestration, and packaged-app smoke pass. |
| Engine runtime | Healthy | Build, syntax checks, 29 tests, shell-safe process launching, and live Docker boot smoke pass. |
| Docker image | Hardened and reduced | Pinned multi-stage build passes live ROM smoke at `1.15GB`; build tools are absent from the runtime image. |
| Supabase | Deployed | Security-definer hardening and atomic-reaction migrations were applied to the hosted database. |

## Next Work Queue

Work these in order unless a production incident changes priority.

### NEXT-07 — P1: Complete Real Integration Proof

**Still requires target environments**

- Signed-in hosted browser flows against Render/Supabase.
- Real two-device LAN stream and certificate UX.
- P3/P4 `/dev/uinput` behavior on a target Linux host.
- Packaged installer smoke on each native OS.
- TURN relay behavior where direct/STUN connectivity fails.

### NEXT-13 — P1: Harden Gameplay Boot And Stream UX

**Scope:** Single-player cloud/local game boot, WebRTC connection lifecycle,
stream retry behavior, lobby share metadata, and gameplay-focused rendered
interaction coverage.

**Why this remains:** The core stream path has useful unit contracts and smoke
tooling, but the active player screen still needs a focused pass around
user-facing error states, repeated engine events, share-context accuracy,
keyboard focus behavior across overlays, and cloud/local boot failure recovery.
`DONE-31` fixed the highest-risk keyboard input leak found during this audit,
but the full gameplay path still needs a deeper interaction pass.

**Completion proof:**

- Add rendered player harness coverage for stream error/retry, telemetry
  toggling, lobby controls, and focused form fields.
- Ensure lobby metadata uses the actual engine exposure/share context.
- Prove single-player cloud and local-vault boot failures surface actionable
  recovery without stale state.
- Run local Docker/engine smoke with a real playable ROM when available.

### NEXT-14 — P1: Harden Game Submission Workflow

**Scope:** Developer submission form, browser storage uploads, API metadata
creation, partial upload cleanup, validation, and user-facing retry states.

**Why this remains:** The backend submission boundary is protected, but the web
form still uses native alerts, has limited pending/error detail, and uploads
files before metadata creation without cleaning uploaded objects if the API
write fails. It also lacks focused frontend coverage for rejected file types,
auth loss, storage failure, metadata failure, and duplicate submits.

**Completion proof:**

- Replace native alerts with visible validation, pending, success, and retry
  states.
- Add single-flight submission locking and explicit file-size/type guidance.
- Clean up newly uploaded submission objects when the backend metadata write
  fails.
- Add Node contracts for submission mutation cleanup and rendered harness
  coverage for the form.

### NEXT-15 — P1: Harden Local Vault Workflow

**Scope:** Local Vault upload/list/delete, engine pairing recovery, delete
confirmation, per-file pending state, local pagination/search if needed, and
multiplayer local-game selection reuse.

**Why this remains:** Local Vault is functional and engine-token gated, but the
UI still uses native `confirm`, upload/delete operations are not fully
single-flight, failed list loads collapse into an empty-state style, and local
game names are passed directly through route params in multiple places. Engine
routes have server-side filename/path hardening, but frontend recovery and
interaction coverage need the same treatment as admin/profile flows.

**Completion proof:**

- Replace native delete confirmation with the shared in-app confirmation
  pattern.
- Add per-file pending locks, retryable load state, input reset after
  validation/upload, and clear invalid-token recovery.
- Share local-vault listing/normalization helpers with Multiplayer local-game
  selection.
- Add contracts and rendered harness coverage for upload validation, delete
  confirmation, and pairing loss.

## Core Gameplay Audit Notes

Added on 2026-06-14 after reviewing the active player, multiplayer setup,
submission, and local-vault flows.

- **Single-player gameplay:** Cloud/local boot and WebRTC streaming have solid
  helper coverage and smoke tooling, but the rendered player screen still needs
  a pass around retry/error UX, telemetry toggling, lobby controls, and real ROM
  playability. `DONE-31` fixed the most immediate input correctness issue found
  during this review.
- **Multiplayer gameplay:** Lobby roles, slots, backend metadata, LAN invite
  parsing, and smoke tooling exist. Remaining confidence depends on real
  two-device LAN proof, Linux `/dev/uinput` P3/P4 behavior, TURN fallback, and
  ensuring lobby metadata reflects the active engine share context.
- **Game submission:** Backend validation and submitter ownership are strong,
  but frontend submission still needs visible validation/errors, duplicate
  submit protection, and cleanup of files uploaded before a failed metadata
  write.
- **Local Vault:** Engine routes enforce token and filename/path hardening, but
  frontend vault upload/delete/list behavior still needs in-app confirmation,
  per-file pending state, retryable list errors, and reusable local game
  normalization shared with Multiplayer.

## Deployment Actions

### DEPLOY-01 — Apply Supabase Security-Definer Hardening

**Status:** Deployed to the hosted database on 2026-06-13.

Migration:
`supabase/migrations/20260613150000_harden_security_definer_functions.sql`

### DEPLOY-02 — Apply Atomic Reaction Functions Before the API Release

**Status:** Deployed to the hosted database on 2026-06-13.

Migration: `supabase/migrations/20260613210000_atomic_reaction_writes.sql`

### DEPLOY-03 — Configure the Hosted Shared Rate-Limit Store

**Status:** Configured and verified on the hosted API on 2026-06-14.

An Upstash-compatible Redis REST database is configured through
`RATE_LIMIT_REDIS_REST_URL`, `RATE_LIMIT_REDIS_REST_TOKEN`, and optionally
`RATE_LIMIT_REDIS_TIMEOUT_MS` on the hosted API. Production `/health` reports
`rateLimitStore: "redis"` and `/ready` confirms the shared store is available.

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

**Remaining action:** Configure the hosted shared store. See `DEPLOY-03`.

### DONE-07 — Prepare Supabase Security-Definer Hardening

**Problem:** Legacy play-count, account-delete, and signup-profile functions did
not fully fix `search_path` or consistently restrict execution grants.

**Resolution:** Added a forward migration using an empty `search_path`, fully
qualified objects, restricted browser-role execution, and retained service-role
play-count access.

**Verification:** Migration reviewed against current API boundaries.

**Deployment:** The hardening migration was applied to the hosted database.

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
image. The remaining image work was completed in `DONE-14`.

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

**Remaining action:** Configure the hosted shared store. See `DEPLOY-03`.

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

### DONE-15 — Replace Shell-Composed Process Calls

**Problem:** Desktop Docker orchestration, engine keyboard injection, and
PulseAudio startup composed commands for a shell. Even with validated inputs,
this left unnecessary quoting, shell-metacharacter, and cross-platform risks.

**Resolution:** Docker pull/build streams now use `spawn`; collected Docker
commands use `execFile`; Docker run/remove arguments are assembled as arrays.
Engine keyboard injection uses `execFile` with an explicit `DISPLAY`
environment, and PulseAudio starts through `spawn`. Startup-failure cleanup
continues even when the best-effort container removal fails.

**Verification:** Desktop tests pass 42 contracts, including literal handling of
environment values containing shell metacharacters and a structural rejection
of shell `exec` in Docker paths. Engine tests pass 29 contracts, including
xdotool and PulseAudio argument construction. A freshly rebuilt unpacked
desktop app passes packaged release smoke. A freshly rebuilt engine image passes
live Docker health smoke with Xvfb and PulseAudio running.

### DONE-16 — Coordinate API Abuse Controls Across Instances

**Problem:** Session-verification, report, comment, reaction, and play-count
limits used process-local counters that reset on restart and did not coordinate
across horizontally scaled API instances.

**Resolution:** Added namespaced, atomic fixed-window counters through an
Upstash-compatible Redis REST store. Counter keys hash user/session/IP
identifiers. Redis calls have a strict timeout and degrade to the existing
bounded in-memory limiter during local development or a store outage.
Submission and stream-metric limits remain coordinated through existing
Supabase rows. Production readiness now requires the shared store configuration.

**Verification:** API tests pass 44 contracts, including cross-instance counter
coordination, hashed Redis keys, and bounded local fallback during Redis
failures. Typecheck, lint, and build pass.

### DONE-17 — Clarify Repository And Web Module Ownership

**Problem:** The repository top level was sound, but the web app's flat
`src/lib/` directory mixed authentication, engine connection, and WebRTC
infrastructure. The `.context/` folder also lacked a clear documentation entry
point.

**Resolution:** Grouped reusable web infrastructure under `lib/auth/`,
`lib/engine/`, and `lib/webrtc/` while preserving feature-owned UI and hooks
under `features/`. Added a context index and a directory-structure audit that
records keep-as-is decisions and staged decomposition work for oversized
modules.

**Verification:** Web lint, production build, and all 10 regression contracts
pass. No stale imports or old path references remain; `git diff --check` passes.

### DONE-18 — Decompose Oversized Web And Desktop Modules

**Problem:** Several web screens and desktop controllers owned unrelated
responsibilities, making behavior changes harder to review and focused logic
harder to test.

**Resolution:** Extracted stable web contracts, pure helpers, and feature-owned
presentation from pairing, multiplayer, profile, WebRTC, and API modules.
Split desktop companion certificate, invite-state, status-page, and proxy logic
from server composition. Split engine launch context, invite creation, and
Docker run arguments from lifecycle composition.

**Verification:** Web lint, production build, and all 12 tests pass. Desktop
build and all 45 tests pass, including focused certificate and engine-launch
contracts. Desktop packaged release smoke and `git diff --check` pass.

### DONE-19 — Establish Catalog And Moderation API Domains

**Problem:** Catalog and moderation route files mixed request validation,
privilege rules, query helpers, and route registration in the flat route
registry.

**Resolution:** Preserved the stable `routes/catalog.ts` and
`routes/moderation.ts` registration imports as compatibility entry points.
Moved their implementations into domain-owned modules and extracted catalog
contracts/services plus moderation contracts/policies. Added focused pure
contract tests for cache-key normalization, pagination, featured selection, and
moderation privilege rules.

**Verification:** API typecheck, lint, build, and all 47 tests pass.
`git diff --check` passes.

### DONE-20 — Group Root Smoke Tooling By Environment

**Problem:** Hosted browser checks, LAN multiplayer evidence tooling, and LAN
tool tests shared one flat root `scripts/` directory. This obscured ownership
and made the available smoke command surface harder to discover.

**Resolution:** Grouped hosted checks under `scripts/hosted/` and LAN scripts
plus their tests under `scripts/lan/`. Preserved existing hosted npm command
names, added discoverable LAN and root smoke-test commands, corrected
repository-root resolution after the moves, and updated all operational command
examples.

**Verification:** All 9 root smoke-tool tests pass. Hosted auth, hosted pairing,
LAN smoke, and LAN summary CLI help commands pass. All moved scripts pass
`node --check`; no stale script-path references remain; `git diff --check`
passes.

### DONE-21 — Close Remaining Source Structure Anomalies

**Problem:** The engine runtime retained one CommonJS JavaScript signaling test
inside an otherwise TypeScript source tree, and `allowJs` allowed future source
anomalies to bypass strict TypeScript checks.

**Resolution:** Converted the final JavaScript signaling test to strict
TypeScript, removed `allowJs`, and added an engine source-shape check that
rejects future `.js` files under `engine/runtime/src/`. Audited generated
directories and confirmed they remain ignored and untracked without deleting
useful local build output.

**Verification:** Engine build, source/syntax checks, and all 29 tests pass.
No JavaScript files remain under `engine/runtime/src/`; generated artifact
directories are ignored and untracked; `git diff --check` passes.

### DONE-22 — Repair Hosted Auth Smoke Contract Drift

**Problem:** The hosted auth CI smoke still waited for the former signup-success
copy after the UI adopted an account-enumeration-safe pending message. The
correct hosted UI state was reached, but the stale locator timed out.

**Resolution:** Updated the hosted signup smoke to assert the current
enumeration-safe pending message and added it to the repository auth contract
check so future UI/smoke drift fails immediately.

**Verification:** Hosted-auth script syntax/help, all 9 root smoke-tool tests,
and web lint, production build, and all 12 tests pass. The real hosted flow
requires CI production secrets and remains the deployment proof.

### DONE-23 — Add Pre-Deploy Hosted Contract Gate

**Problem:** The reusable deploy gate validated the API but did not validate the
web build or hosted smoke source contracts before triggering Render and Vercel.
Deterministic UI/smoke drift could therefore fail only after production deploys
had already started.

**Resolution:** Added secret-free contract-only modes for hosted auth and
pairing smoke scripts plus a reusable `hosted-contract` CI job. The job validates
hosted smoke source contracts, root smoke tooling, the web build/lint/tests, and
desktop companion tests before production deployment hooks can run.

**Verification:** `npm run verify:hosted-contract` and `npm run verify:api` pass
locally. Workflow YAML structure, package commands, moved paths, and
environment-variable contracts were traced against current source. Live Render
`/health` reports Redis and `/ready` passes; the deployed Vercel bundle contains
the current pairing and safe-signup contract markers.

### DONE-24 — Isolate API Tests From Ambient Redis Credentials

**Problem:** Configuring real Upstash credentials in `services/api/.env` caused
API tests to consume shared production-like counters. This made local tests
slow, order-dependent, and capable of failing with unexpected `429` responses.

**Resolution:** Shared rate limiters ignore ambient Redis credentials under the
Node test runner while preserving explicit mocked-Redis injection. Added a
regression contract proving ambient credentials cannot trigger Redis requests
during tests.

**Verification:** API typecheck, lint, build, and all 48 tests pass with real
Redis credentials present locally. The suite completes deterministically
without touching Upstash.

### DONE-25 — Harden Self-Service Account Deletion

**Problem:** Self-service account deletion existed but relied partly on
frontend-only safeguards. OAuth users only typed `DELETE`, privileged-role
blocking existed only in the UI, user-owned storage objects were not removed,
and the destructive endpoint had no dedicated rate limit or recent-sign-in
requirement.

**Resolution:** Kept account deletion unavailable to admins and super admins at
both UI and API layers. The API now requires an exact confirmation payload, a
sign-in within the previous 10 minutes, and a non-privileged database role.
Deletion attempts use the shared rate-limit infrastructure. Before deleting the
Supabase auth user, the API recursively removes owned avatar and submission
storage objects and aborts if storage cleanup fails. Successful deletion clears
cached role state and lets existing foreign-key behavior cascade or anonymize
related database records.

**Verification:** Added backend regressions proving successful owned-file
cleanup, privileged-role rejection, stale-session rejection, invalid
confirmation rejection, deletion rate limiting, and fail-closed storage
cleanup. API typecheck, lint, and all 51 tests pass; web production build
passes.

### DONE-26 — Harden Social Interaction Workflows

**Problem:** Comments, reactions, reporting, and moderation actions had strong
backend authorization but weak frontend request lifecycle behavior. Overlapping
comment pages could duplicate rows, stale requests could update a newly opened
game, mutations could be submitted repeatedly, report failures closed their
modal, and most failures were visible only through native alerts or console
output.

**Resolution:** Added stale-game and overlapping-page protection, comment-page
deduplication, explicit initial/load-more states, visible error and retry UI,
and per-comment mutation locks. Game reactions now ignore stale responses,
prevent duplicate mutations, expose pending state, and display API-safe errors.
Report failures remain open with actionable feedback while successes surface in
the comments panel. Moderation actions are single-flight, expose load/action
errors, and refresh server state after completion.

**Verification:** Added comment-boundary deduplication and API-safe social error
contracts. Web lint, production build, all 16 tests, and `git diff --check`
pass. The rendered interaction harness was later established in `DONE-30`.

### DONE-27 — Harden Favorites And Catalog Interaction State

**Problem:** Homepage cards, the featured banner, and the favorites library each
owned independent favorite state. Rapid clicks could issue conflicting
mutations, an older favorite load could overwrite a newer mutation, removing a
favorite from My Library left its card visible, and stale catalog requests
could replace newer search/page results.

**Resolution:** Added a shared auth-scoped favorite store and hook that
coordinates one initial load, synchronizes every rendered favorite surface,
locks per-game mutations, preserves prior state on failure, reconciles older
in-flight loads with newer mutations, and resets/reloads across auth changes.
My Library now removes cards after successful unfavorite actions and exposes
load-error retry UI. Catalog and featured requests use request sequencing so
stale responses cannot overwrite newer state. Featured navigation now handles
refreshed game lists safely and uses accessible controls.

**Verification:** Added shared-load, duplicate-mutation, authoritative-response,
failure rollback, and in-flight-load reconciliation contracts. Web lint,
production build, all 20 tests, and `git diff --check` pass. The rendered
interaction harness was later established in `DONE-30`.

### DONE-28 — Harden Profile And Account Settings Workflows

**Problem:** Profile-load failures disappeared after the loading skeleton,
OAuth-only users were shown a password form they could not use, rapid submits
could duplicate mutations, and avatar uploads overwrote the active object
before the profile update succeeded. Metadata-sync and sign-out failures could
also make a successful authoritative mutation appear to have failed entirely.

**Resolution:** Added explicit profile load-error/retry state and single-flight
guards for profile, password, crop, and account-deletion actions. Avatar input
now validates image type and size, crop failures surface in the page, object
preview URLs are released, and replacements use versioned storage paths. Failed
profile API updates remove newly uploaded objects; successful replacements
clean the previous owned avatar; metadata-sync and cleanup failures surface as
clear partial-success warnings. Password changes use the shared password policy
and are shown only for email-password accounts. Account deletion treats local
sign-out as best effort after the API has authoritatively deleted the account.
Profile and deletion dialogs now expose dialog semantics and lock dismissal
while work is pending.

**Verification:** Added avatar validation, owned-path isolation, failed-upload
and failed-save cleanup, and partial-success regression contracts. Web lint,
production build, all 25 tests, unauthenticated `/profile` redirect smoke, console-error check,
and `git diff --check` pass. The rendered interaction harness was later
established in `DONE-30`.

### DONE-29 — Harden Admin Frontend Operations

**Problem:** Admin frontend behavior lagged behind backend authorization
coverage. Moderation filters were applied only to the currently loaded server
page, so filtered queues could appear empty while matching reports existed on
other pages. User-management load failures could leave a permanent skeleton,
role/ban actions used native confirm/alert dialogs, and destructive mutations
were not consistently locked or reconciled with pagination.

**Resolution:** Added a server-side `targetRole` filter to the admin reports
endpoint so moderation pagination and counts are authoritative for all, user,
or admin-target reports. The moderation queue now requests the active filter
from the API, resets to page 1 when filters change, clamps pages after action
removal, exposes safe API error messages, and uses an in-app confirmation dialog
for user bans. User management now has retryable load-error states,
stale-response protection for search/page requests, per-user single-flight
locks, in-app confirmations for role/ban changes, and visible action errors.
The admin shell now exposes a retryable access-check failure instead of a
permanent spinner. Access logs share the same tested page-range label behavior.

**Verification:** Added web contracts for admin API-safe error messages,
post-removal page clamping, and page-range labels. Added API regression coverage
proving report target filters apply before pagination. Web lint, production
build, all 28 web tests, API typecheck, lint, build, all 52 API tests, local
`/admin` dev-server HTTP smoke, no native admin `alert`/`confirm` usage, and
`git diff --check` pass. Admin component interaction coverage was added in
`DONE-30`; full authenticated role coverage remains a future expansion.

### DONE-30 — Establish Frontend Interaction Test Harness

**Problem:** The web package had focused Node contracts and hosted smoke tests,
but no maintainable local browser-level harness for rendered interaction. That
left modal accessibility, dropdown actions, pending states, and pagination
behavior dependent on manual QA or production smoke coverage.

**Resolution:** Added a Vite-served React interaction harness under
`apps/web/interaction-tests/` and a Playwright runner at
`scripts/web/interactionHarnessSmoke.mjs`. The harness renders real admin UI
components with fake async boundaries, exercises the admin confirmation dialog,
report-card dropdown actions, locked-review states, pagination controls, and
console-error detection. Added `npm run test:web-interactions` and wired it into
the hosted contract verification gate. CI now installs Chromium before running
the hosted web contract.

**Verification:** Web lint, production build, all 28 web Node contracts,
`node --check` for the interaction harness runner, and
`npm run test:web-interactions` pass. The harness currently covers the admin
interaction surface; broader profile/favorites rendered flows can now be added
incrementally on the same foundation.

### DONE-31 — Prevent Gameplay Input Leaking From Form Fields

**Problem:** The WebRTC gameplay input bridge listened globally for keydown and
keyup events once a participant owned a player slot. It ignored repeated keys
but did not ignore focused text-entry controls, so typing in comments, report
dialogs, search fields, or other focused form elements while a stream was active
could also emit gameplay input to the local engine.

**Resolution:** Added a shared input-filter guard for the WebRTC input bridge.
Gameplay input now ignores already-prevented events, `input`, `textarea`,
`select`, content-editable targets, and containers explicitly marked with
`data-ignore-game-input`, while ordinary gameplay targets still forward keys to
the engine.

**Verification:** Added regression contracts for ignored text-entry/editable
targets, explicit ignore containers, prevented events, and ordinary gameplay
targets. Web tests now pass with 31 contracts; lint, production build, and
`git diff --check` pass.

## Latest Verification Run

Run on 2026-06-14 after the completed hardening work:

| Gate | Result |
| --- | --- |
| Web tests, lint, production build, and rendered interaction harness | Passed — 31 Node tests plus Playwright harness |
| API typecheck, lint, build, and tests | Passed — 52 tests |
| Desktop build and tests | Passed — 45 tests |
| Desktop packaged release smoke | Passed |
| Engine build, syntax checks, and tests | Passed — 29 tests |
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
