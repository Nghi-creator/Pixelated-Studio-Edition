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

The API now handles authenticated identity/permissions, low-risk player mutations, comment reports, persisted local pairing metadata, persisted stream metric ingestion, and cloud game session creation/verification. The local engine still runs separately on `localhost:8080`.

Implemented now:

- Fastify server bootstrap.
- Environment parsing.
- CORS for localhost web and hosted Vercel origin.
- `GET /health`.
- `GET /`.
- `GET /ready`.
- Supabase JWT verification middleware.
- Authenticated `GET /me`.
- Authenticated `GET /me/permissions`.
- Authenticated `POST /games/:gameId/play-count`.
- Authenticated `POST /moderation/comments/:commentId/report`.
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
GET /me
GET /me/permissions
POST /games/:gameId/play-count
POST /moderation/comments/:commentId/report
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
