# Target Architecture Reference

Last reviewed: 2026-06-17

This is a durable architecture-intent note, not a backlog. The original
pre-refactor plan was removed because the repository has already moved to the
`apps/`, `services/`, and `engine/` structure.

## Current Top-Level Shape

```text
apps/
  web/       Vite React frontend
  desktop/   Electron desktop companion and Docker orchestration
engine/
  runtime/   local engine HTTP/Socket.IO bridge and emulator runtime image
services/
  api/       hosted Fastify control plane
supabase/    migrations, storage/RLS policy, RPCs
scripts/     hosted, LAN, release, and smoke tooling
.context/    compact operating docs and architecture notes
```

## Ownership Boundaries

### Web App

Owns:

- User-facing library, profile, admin, publish, Local Vault, player, and pairing
  UI.
- Browser auth/session state.
- Local engine URL/token storage.
- WebRTC receiver, input capture, stream telemetry display, and retry UX.

Should avoid owning:

- Admin-sensitive writes outside `services/api`.
- Cloud session authorization.
- Durable audit logging.
- Backend-owned upload/metadata decisions.

### Hosted API

Owns:

- Supabase JWT verification and permission policy.
- Catalog, profile, favorite, comment, reaction, moderation, and admin data
  boundary.
- Cloud/local session metadata and verification.
- Access logs and stream metric ingestion.
- Production rate limiting through the shared Redis REST store.
- Local pairing metadata, never raw desktop tokens.

### Desktop App

Owns:

- Docker diagnostics, startup, shutdown, recovery, and packaged release smoke.
- Engine token generation and display.
- Local/LAN exposure mode.
- HTTPS companion server, launch tickets, invite code redemption, QR data, and
  engine proxying.
- Connected browser listing, per-client revoke, and token rotation controls.

### Engine Runtime

Owns:

- Token-gated local HTTP routes and Socket.IO signaling.
- Local Vault upload/list/delete routes.
- Runtime process lifecycle for emulator/camera bridge.
- Cloud ROM download after backend session verification.
- Input routing, lobby/session rooms, and stream telemetry.
- Revoked browser client/access identity enforcement.

### Supabase

Owns:

- Auth, Postgres, storage buckets, RLS, and RPC migrations.
- Browser-visible Storage writes only where explicitly intended.
- Hosted schema/policy state verified by predeploy gates.

## Design Principles

- Keep the web app as presentation plus client orchestration; route sensitive
  data decisions through `services/api`.
- Keep the desktop local-first and explicit about LAN exposure.
- Never share raw host-local engine tokens with LAN guests.
- Treat companion credentials as revocable browser access, not durable account
  secrets.
- Prefer small ownership-oriented modules over file-type folders.
- Keep generated smoke output transient unless the user asks to preserve it.

## Future Architecture Work

- Add shared contract/types package only when duplication across web/API/engine
  becomes costly enough to justify the package.
- Revisit hosted engine/node allocation only after local/LAN stream reliability
  and TURN fallback are proven.
- Keep `.context/current-infrastructure.md` as the source of truth for current
  behavior; this file should stay short and directional.
