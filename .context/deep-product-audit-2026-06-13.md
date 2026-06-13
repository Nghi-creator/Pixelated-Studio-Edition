# Deep Product Audit

Date: 2026-06-13

Scope: frontend, API backend, Electron desktop, Docker engine runtime, Supabase
migrations, repository checks, and local smoke harnesses. This pass intentionally
avoids new product features.

## Fixed In This Pass

### High: Backend sessions could be overwritten by another user

`POST /sessions` accepted a browser-supplied `clientSessionId` and used a
service-role upsert. A signed-in user who learned another active session id
could replace its owner, token hash, and boot target.

Resolution:

- Session creation is insert-only.
- Active duplicate ids return `409`.
- Database uniqueness races return `409`.
- A regression test proves another user's active session remains unchanged.

### High: Desktop logs rendered runtime output as HTML

Docker/runtime log output reached the Electron renderer and was appended through
`innerHTML`. A crafted log line could become active renderer markup.

Resolution:

- Logs are appended as text nodes.
- Existing presentation-only span wrappers are removed before display.
- Desktop package tests reject reintroducing `innerHTML` assignment.

### Medium: API mutations reported success after storage failures

Several favorite, reaction, comment, pairing, lobby, and session mutations
discarded Supabase errors and returned success or `204`.

Resolution:

- Affected routes now log storage failures and return `500`.
- Idempotent missing-resource behavior remains unchanged.

### High: Admin target authorization could fail open

The super-admin user update route checked the target role but ignored errors from
that lookup. A partial database failure could bypass the target-role guard and
continue to the update.

Resolution:

- Target-role lookup failures now stop the request with `500`.
- Existing self-modification and super-admin target protections remain intact.

### Medium: Invite pairing initialization failed the web lint gate

The companion invite path synchronously changed multiple state values from a
mount effect, triggering React's cascading-render lint rule.

Resolution:

- Invite URL, invite mode, and preflight state are derived in lazy state
  initializers.
- The redundant mount effect was removed.

## Remaining Priorities

### P0: Protect the public account-method lookup

`POST /auth/account-methods` reveals whether an email exists and which providers
it uses. It also scans up to 10,000 Supabase Auth users per request. This enables
account enumeration and creates an expensive unauthenticated endpoint.

Recommended next step:

- Remove provider-specific disclosure from unauthenticated responses, or protect
  the endpoint with CAPTCHA plus strict IP/email rate limits.
- Replace paginated full-user scans with a bounded server-side lookup strategy.

### P0: Add API and companion abuse controls

The API has route-specific submission/metric throttles but no global request
rate limiting. The LAN companion invite redemption endpoint also has no
attempt/backoff limit.

Recommended next step:

- Add Fastify rate limits for auth lookup, session verification, reports,
  play-count writes, and other public/high-write routes.
- Add per-source invite redemption backoff and rotate/revoke codes after repeated
  failures.

### P0: Harden legacy Supabase `SECURITY DEFINER` functions

Several older migrations create `SECURITY DEFINER` functions without a fixed
`search_path`, including play-count, account-delete, and signup-profile helpers.
Function execute grants are also not consistently explicit.

Recommended next step:

- Add a forward-only hardening migration that sets `search_path = ''`, fully
  qualifies referenced objects, revokes default `PUBLIC` execution, and grants
  only the roles that still require each function.
- Verify hosted grants before deployment because the API currently calls
  `increment_play_count` with the service role.

### P1: Make replace-style reactions atomic

Game and comment reaction updates currently delete the old reaction before
inserting the replacement. Errors are now surfaced correctly, but an insert
failure can still leave the user with no reaction.

Recommended next step:

- Move replacement into a database function/transaction or use a unique-key
  upsert that can represent the desired state atomically.

### P1: Improve frontend regression coverage

The web package has lint/build gates but no component or hook test suite. Pairing,
auth, pagination, cache invalidation, and WebRTC lifecycle behavior therefore
depend heavily on hosted/manual smoke tests.

Recommended next step:

- Add focused tests for engine invite initialization, API timeout/abort behavior,
  comment pagination, auth-state cache clearing, and WebRTC cleanup/retry.

### P1: Make the engine image reproducible and smaller

The Dockerfile clones the latest Mesen branch, installs Node through a remote
setup script, uses `npm install`, and leaves build tooling in the runtime image.

Recommended next step:

- Pin the Mesen commit and Node source/image.
- Use `npm ci`.
- Consolidate apt layers and clean package lists.
- Move compilation into a multi-stage build or publish a versioned prebuilt
  engine image.

### P1: Replace shell-composed process calls where practical

Desktop Docker orchestration and engine keyboard injection still use shell
commands through `exec`. Current inputs are mostly validated or allowlisted, but
argument-array `spawn`/`execFile` calls would reduce quoting risk and improve
cross-platform behavior.

### P1: Complete real integration proof

Automated local contracts are strong, but the following remain environment
dependent:

- Signed-in hosted browser flows against Render/Supabase.
- Real two-device LAN stream and certificate UX.
- P3/P4 `/dev/uinput` behavior on a target host.
- Packaged installer smoke on each native OS.
- TURN relay behavior on a network where direct/STUN connectivity fails.

## Documentation Consistency

`.context/current-infrastructure.md` is the best current source of truth.
Sections of `.context/project-flows.md`, `.context/suggestions.md`, and older
plans still describe direct browser Supabase reads/writes or already-completed
work. Treat those sections as historical until they are reconciled.

The root README also contains older product claims and minor wording/typo issues.
It should be refreshed after the security and integration priorities above.

## Verification Summary

Passed during this audit:

- Web lint and production build.
- API typecheck, lint, build, and focused route/control-plane tests.
- Desktop TypeScript build and test suite.
- Engine runtime build, JavaScript syntax checks, and test suite.
- Root smoke-artifact summarizer and multiplayer smoke helper tests.
- `git diff --check`.

Environment-dependent smoke results and any blockers should be appended here
after the final audit commands complete.

## Environment-Dependent Results

- Docker runtime smoke could not run because Docker Desktop was not running and
  the local Docker socket did not exist.
- The existing packaged desktop release smoke initially failed because its
  bundled `web-dist` was stale relative to the fresh web build.
- Rebuilding the macOS package refreshed the unpacked app, but DMG creation
  failed in `hdiutil` after electron-builder retries. The unpacked packaged-app
  smoke was run separately after that refresh.
- macOS code signing was skipped because no Developer ID identity is installed
  in this environment.
