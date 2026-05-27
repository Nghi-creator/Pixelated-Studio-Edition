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

The API now handles authenticated identity/permissions, game catalog reads, favorites, reactions, comments, profile updates/deletion, admin reports, admin users, access logs, game submission metadata and notifications, persisted local pairing metadata, persisted stream metric ingestion, and cloud game session creation/verification. The local engine still runs separately on `localhost:8080`.

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
- Authenticated `POST /sessions`.
- `POST /sessions/:sessionId/verify` for local engine cloud session verification.
- Authenticated local pairing routes.
- Authenticated stream metric routes.
- Supabase anon/service clients.

Next phase:

- Add integration smoke tests with a real staged Supabase access token when practical.

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
POST /sessions
GET /sessions/:sessionId
DELETE /sessions/:sessionId
POST /local-pairings
GET /local-pairings/current
DELETE /local-pairings/current
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

The current tests use Fastify injection and a fake Supabase service, so they do not require local database access.
