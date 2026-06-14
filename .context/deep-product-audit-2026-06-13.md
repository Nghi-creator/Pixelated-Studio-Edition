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
| Web frontend | Healthy, focused coverage added | Lint, production build, and 12 lifecycle regression contracts pass; shared infrastructure and large feature modules are grouped by ownership. |
| API backend | Hardened and deployed | Public account enumeration is closed, reactions are atomic, production abuse controls use shared Redis counters, and catalog/moderation logic is grouped by domain ownership. |
| Desktop | Healthy | Build, 45 tests, decomposed companion/launch ownership, companion security controls, shell-safe Docker orchestration, and packaged-app smoke pass. |
| Engine runtime | Healthy | Build, syntax checks, 29 tests, shell-safe process launching, and live Docker boot smoke pass. |
| Docker image | Hardened and reduced | Pinned multi-stage build passes live ROM smoke at `1.15GB`; build tools are absent from the runtime image. |
| Supabase | Deployed | Security-definer hardening and atomic-reaction migrations were applied to the hosted database. |

## Next Work Queue

Work these in order unless a production incident changes priority.

### NEXT-09 — P1: Harden Favorites And Catalog Interaction State

**Scope:** Homepage cards, featured banner favorites, favorites library, and
catalog search/pagination interaction.

**Why this remains:** Favorite API boundaries and auth-scoped caching are
covered, but UI state can drift. Favorite buttons have no pending/error state,
rapid clicks can issue conflicting mutations, removing a favorite from the
library does not remove its card, and featured/banner requests can apply stale
results after the displayed game changes.

**Completion proof:**

- Centralize or synchronize favorite state across cards, banner, and library.
- Add mutation locking, rollback/error feedback, and stale-request protection.
- Verify favorites removal, auth redirects, search, and pagination in browser
  interaction tests.

### NEXT-10 — P1: Harden Profile And Account Settings Workflows

**Scope:** Profile loading/updating, avatar crop/upload, password changes, and
the newly hardened account-deletion UI.

**Why this remains:** Account deletion now has strong backend regressions, but
the rest of the profile UI primarily relies on lint/build. Avatar upload,
partial update failures, password reauthentication, stale profile state, and
storage cleanup/replacement behavior lack focused interaction coverage.

**Completion proof:**

- Make each profile mutation expose clear pending, success, failure, and retry
  states without partial-success confusion.
- Verify avatar replacement/storage behavior and password-provider paths.
- Add browser/component coverage for ordinary users and privileged-role
  deletion blocking.

### NEXT-11 — P1: Harden Admin Frontend Operations

**Scope:** Moderation queue, user management, access logs, permissions, and
admin navigation.

**Why this remains:** API authorization has deep regression coverage, but admin
screen behavior does not. User-management fetch failures can leave a permanent
skeleton, actions are not locked while pending, moderation filters operate only
on the current server page, and destructive action/error states rely heavily on
native alerts and confirms.

**Completion proof:**

- Add explicit load-error/retry and pending-action states to every admin screen.
- Prevent duplicate destructive mutations and reconcile pagination after
  actions.
- Make moderation filtering semantics accurate across server pagination.
- Add role-specific browser coverage for user, admin, and super-admin access.

### NEXT-12 — P2: Establish Frontend Interaction Test Harness

**Scope:** Shared browser/component test infrastructure for the feature phases
above.

**Why this remains:** The current 14 web tests cover pure lifecycle and helper
contracts, not rendered user interaction. Hosted auth/pairing smoke proves only
two narrow production flows.

**Completion proof:**

- Add a maintainable rendered-interaction harness with mocked API/auth
  boundaries.
- Cover keyboard/accessibility behavior, request races, failure states, and
  responsive layouts.
- Keep a smaller hosted smoke suite for critical real-environment flows.

### NEXT-07 — P1: Complete Real Integration Proof

**Still requires target environments**

- Signed-in hosted browser flows against Render/Supabase.
- Real two-device LAN stream and certificate UX.
- P3/P4 `/dev/uinput` behavior on a target Linux host.
- Packaged installer smoke on each native OS.
- TURN relay behavior where direct/STUN connectivity fails.

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
pass. Broader rendered keyboard/visual interaction coverage remains tracked by
`NEXT-12`.

## Latest Verification Run

Run on 2026-06-14 after the completed hardening work:

| Gate | Result |
| --- | --- |
| Web tests, lint, and production build | Passed — 16 tests |
| API typecheck, lint, build, and tests | Passed — 51 tests |
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
