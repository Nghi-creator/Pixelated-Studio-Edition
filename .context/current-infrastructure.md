# Current Infrastructure Snapshot

Last reviewed: 2026-07-01

This is the compact source of truth for the current deployed/local system.
Implementation history and stale audit detail belong in Git history.

## Top-Level Shape

```text
apps/web/       Vite React 19 frontend
apps/desktop/   Electron desktop app, Docker orchestration, HTTPS companion
engine/runtime/ local engine API, Socket.IO signaling, emulator/runtime image
services/api/   hosted Fastify control plane
supabase/       migrations, storage/RLS policy, RPCs
scripts/        hosted, LAN, release, and smoke tooling
```

## Hosted API

`services/api` is the app data boundary. Browser Supabase usage should stay
limited to auth/session and intentional Storage uploads.

Owns:

- Supabase JWT verification, roles, and permissions.
- Catalog, favorites, comments, reactions, profile, submissions, moderation,
  admin users, and access-log routes.
- Cloud session creation/verification and backend-approved boot targets.
- Local pairing metadata without storing desktop engine tokens.
- Multiplayer lobby metadata, stream metrics, cleanup jobs, and ICE server
  configuration.
- Production shared rate limiting through Redis REST when configured.

Important runtime checks:

- `GET /`, `HEAD /`, `GET /health`, `GET /ready`.
- Production must listen on `0.0.0.0`.
- `/ready` requires Supabase config and production shared rate-limit store.

Primary gates:

- `npm run verify:api`
- `npm run verify:hosted-contract`
- `npm run predeploy:hosted` with staging secrets

## Web App

`apps/web` owns the user experience and browser orchestration.

Main routes:

- `/`: cloud library
- `/engine`: engine connection and pairing
- `/play/:id`: player and WebRTC stream
- `/local`: Local Vault
- `/multiplayer`: LAN/multiplayer setup
- `/favorites`, `/profile`, `/publish`, `/login`, `/reset-password`
- `/admin`, `/admin/users`, `/admin/logs`

Key behaviors:

- Uses `apps/web/src/lib/apiClient.ts` for app data through `services/api`.
- Uses Supabase client for auth/session and Storage uploads.
- Stores engine URL/token in browser local storage.
- Requires engine pairing for `/play/:id`, `/local`, and `/multiplayer`.
- Cloud game boot asks the API for a signed session before asking the local
  engine to boot.
- Local Vault talks directly to the paired local engine.
- WebRTC receiver, input capture, retry state, and telemetry live under
  `apps/web/src/lib/webrtc/` and player feature modules.
- Connection monitor clears raw/invalid tokens on explicit rejection, while
  companion tokens survive transient network/proxy probe failures.

## Desktop App

`apps/desktop` owns local engine lifecycle and the LAN HTTPS companion.

Owns:

- Docker diagnostics, build/pull/run, health polling, stop/cleanup.
- Per-run engine token generation and display.
- Local vs LAN exposure.
- Companion HTTPS server, QR code, invite codes, launch tickets, and proxying.
- Connected-browser listing, per-client revoke, and token rotation.
- Packaged app release smoke.

Packaging:

- `cd apps/desktop && npm run dist`
- Builds `apps/web/dist`, bundles it as `resources/web-dist`, packages Electron,
  then runs release smoke against the unpacked packaged app.

## Engine Runtime

`engine/runtime` is the token-gated local engine service inside Docker.

Owns:

- Express HTTP routes and Socket.IO signaling.
- `/health`, Local Vault upload/list/delete, telemetry routes.
- Cloud ROM download after backend session verification.
- Runtime process lifecycle for libretro/native game launch and camera bridge.
- WebRTC signaling relay and ICE forwarding.
- Input routing and lobby/session rooms.
- Revoked browser client/access identity enforcement.

Runtime pieces:

- Xvfb, PulseAudio, RetroArch, libretro cores, GStreamer/Python bridge, Node 20.
- Optional native Linux runtime manifests for allowlisted Debian-packaged games.
- Docker volume `pixelated-roms` stores Local Vault ROMs.
- Default Docker publish is loopback-only; LAN publish is explicit desktop mode.

Repository shape:

- Production code lives under `engine/runtime/src/`.
- Runtime tests live under `engine/runtime/tests/` and compile to `dist/tests`.

## Supabase

Owns:

- Auth, Postgres, Storage, RLS, and RPCs.
- Submission Storage bucket policies.
- Hosted schema/policy state checked by predeploy gates.

Apply pending migrations through the Supabase CLI before depending on newly
added schema/RPC behavior in hosted environments.

```sh
supabase db push
```

## CI/CD

Key workflows:

- `.github/workflows/hosted-api-deploy-gate.yml`
- `.github/workflows/hosted-deploy.yml`
- `.github/workflows/desktop-release-validation.yml`

Important scripts:

- `npm run verify:hosted-contract`
- `npm run predeploy:hosted`
- `npm run smoke:hosted-pairing`
- `npm run smoke:hosted-auth`
- `npm run smoke:lan`
- `npm --prefix apps/desktop run smoke:release`

Provider auto-deploys should not bypass GitHub deploy gates.

Generated smoke artifacts should stay under `.artifacts/` or another transient
path unless explicitly preserved.

## Durable Architecture Principles

- Keep the web app as presentation plus client orchestration; route sensitive
  data decisions through `services/api`.
- Keep the desktop local-first and explicit about LAN exposure.
- Never share raw host-local engine tokens with LAN guests.
- Treat companion credentials as revocable browser access, not durable account
  secrets.
- Prefer small ownership-oriented modules over generic file-type folders.
- Add a shared contract/types package only when duplication across web, API, and
  engine becomes costly enough to justify the package.
- Revisit hosted engine/node allocation only after local/LAN stream reliability
  and TURN fallback are proven.
