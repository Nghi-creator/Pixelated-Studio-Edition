# Pixelated API

Localhost-first backend control plane for Pixelated Studio.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create or edit the local env file:

   ```bash
   cp .env.example .env
   ```

   This repository already has an ignored `services/api/.env` placeholder for local work. Fill in the Supabase values before testing authenticated routes.

3. Start the API:

   ```bash
   npm run dev
   ```

Default URL:

```text
http://localhost:4000
```

Health check:

```text
GET http://localhost:4000/health
```

Root probe:

```text
GET http://localhost:4000/
```

Readiness check:

```text
GET http://localhost:4000/ready
```

## Current Scope

The API now handles authenticated identity/permissions, game catalog reads, favorites, reactions, comments, profile updates/deletion, admin reports, admin users, access logs, game submission metadata and notifications, WebRTC ICE server config, persisted local pairing and multiplayer lobby metadata, persisted stream metric ingestion, and cloud game session creation/verification. The local engine still runs separately on `localhost:8080`.

Implemented now:

- Fastify server bootstrap.
- Environment parsing.
- CORS for localhost web and hosted Vercel origin.
- `GET /health`.
- `GET /`.
- `GET /ready`.
- `POST /access-logs`.
- Supabase JWT verification middleware.
- Authenticated `GET /me`.
- Authenticated `GET /me/permissions`.
- `GET /games`.
- `GET /games/featured`.
- `GET /games/:gameId`.
- Authenticated favorites routes.
- Authenticated game reaction routes.
- Authenticated comment and comment reaction routes.
- Authenticated profile routes.
- Authenticated `POST /games/:gameId/play-count`.
- Authenticated `POST /moderation/comments/:commentId/report`.
- Authenticated `GET /admin/reports`.
- Authenticated `POST /admin/reports/:reportId/action`.
- Authenticated `GET /admin/users`.
- Authenticated `PATCH /admin/users/:userId`.
- Authenticated `GET /admin/access-logs`.
- Authenticated `POST /submissions/games`.
- Optional server-side Formspree notifications for game submissions.
- Authenticated `GET /webrtc/ice-servers`.
- Authenticated `POST /sessions`.
- `POST /sessions/:sessionId/verify` for local engine cloud session verification.
- Authenticated local pairing routes.
- Authenticated multiplayer lobby control-plane routes.
- Authenticated stream metric routes.
- Supabase anon/service clients.

Next phase:

- Run the hosted-stack smoke after API or Supabase control-plane changes.

## Auth Routes

Auth routes expect:

```text
Authorization: Bearer <supabase-access-token>
```

Routes:

```text
POST /access-logs
GET /me
GET /me/permissions
GET /games
GET /games/featured
GET /games/:gameId
GET /favorites
GET /favorites/:gameId
PUT /favorites/:gameId
DELETE /favorites/:gameId
GET /games/:gameId/reactions
PUT /games/:gameId/reaction
GET /games/:gameId/comments
POST /games/:gameId/comments
DELETE /comments/:commentId
PUT /comments/:commentId/reaction
GET /profile
PATCH /profile
DELETE /me/account
POST /games/:gameId/play-count
POST /moderation/comments/:commentId/report
GET /admin/reports
POST /admin/reports/:reportId/action
GET /admin/users
PATCH /admin/users/:userId
GET /admin/access-logs
POST /submissions/games
GET /webrtc/ice-servers
POST /sessions
GET /sessions/:sessionId
DELETE /sessions/:sessionId
POST /local-pairings
GET /local-pairings/current
DELETE /local-pairings/current
PUT /multiplayer/lobbies/:sessionId
GET /multiplayer/lobbies/recent
DELETE /multiplayer/lobbies/:sessionId
POST /metrics/stream
GET /metrics/stream/recent
```

The local engine calls `POST /sessions/:sessionId/verify` with a `sessionToken` created by `POST /sessions`. That route is token-protected rather than Supabase-bearer protected because it is used server-to-engine during cloud game boot.

If Supabase env vars are missing, authenticated routes return `503`.

## Data Boundary

The browser should not call Supabase tables, RPCs, or realtime channels directly. `apps/web/src/lib/apiClient.ts` is the frontend boundary for app data. Browser-side Supabase usage should stay limited to auth/session handling and Storage uploads that intentionally need direct signed-in client upload behavior.

`supabase/migrations/20260527111500_api_owned_social_writes.sql` removes direct browser policies for the workflows now owned by this API. Deploy the matching API and web builds before pushing that migration, or push it immediately after both are live.

## Staging Hosting Notes

Use `/health` for liveness checks and `/ready` for confirming required Supabase env vars are configured.

Minimum backend host env:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider port>
WEB_ORIGIN=https://pixelated-studio-edition.vercel.app
CONTROL_PLANE_CLEANUP_INTERVAL_MS=3600000
STREAM_METRIC_RETENTION_DAYS=7
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=<optional comma-separated turn: or turns: URLs>
TURN_SHARED_SECRET=<optional coturn REST shared secret>
TURN_STATIC_USERNAME=<optional static TURN username>
TURN_STATIC_CREDENTIAL=<optional static TURN credential>
TURN_CREDENTIAL_TTL_SECONDS=3600
FORMSPREE_SUBMISSION_URL=<optional Formspree endpoint for submission notifications>
SUPABASE_URL=<your Supabase URL>
SUPABASE_ANON_KEY=<your Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>
```

## Tests

Run the focused API test suite from this folder:

```bash
npm run test
```

Tests live under `services/api/tests/`. The current tests use Fastify injection and a fake Supabase service, so they do not require local database access.

## Staging Smoke

Run the hosted-stack smoke test with a real signed-in Supabase access token:

```bash
STAGING_BEARER_TOKEN=<supabase-access-token> npm run smoke:staging
```

Environment variables:

- `STAGING_BEARER_TOKEN` or `SUPABASE_ACCESS_TOKEN`: required signed-in bearer token.
- `STAGING_API_URL` or `API_URL`: optional API base URL, defaulting to `https://pixelated-api-services.onrender.com`.
- `STAGING_GAME_ID`: optional game id for cloud session creation. If omitted, the runner discovers the first catalog game with a ROM target.
- `STAGING_SMOKE_ENGINE_URL`: optional local pairing URL, defaulting to `http://127.0.0.1:8080`.

The runner checks `/games` cache headers and `MISS`-then-`HIT` behavior, verifies `/games/featured` remains `no-store`, checks `/me` and `/me/permissions`, exercises local pairing save/read/delete with restore, creates/updates/reads/deletes a multiplayer lobby, creates/reads/verifies/deletes a cloud session, and writes/reads a stream metric. It intentionally writes one stream metric row and temporarily changes local pairing metadata for the signed-in user; smoke lobbies and sessions are deleted before the run exits.
