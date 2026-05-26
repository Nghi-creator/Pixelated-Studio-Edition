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

The API now handles authenticated identity/permissions, low-risk player mutations, comment reports, and cloud game session creation. The local engine still runs separately on `localhost:8080`.

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
- Supabase anon/service clients.

Next phase:

- Add local pairing to the backend/web model, then finish staging deploy prep.

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
```

If Supabase env vars are missing, authenticated routes return `503`.

## Staging Hosting Notes

Use `/health` for liveness checks and `/ready` for confirming required Supabase env vars are configured.

Minimum backend host env:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=<provider port>
WEB_ORIGIN=https://pixelated-studio-edition.vercel.app
SUPABASE_URL=<your Supabase URL>
SUPABASE_ANON_KEY=<your Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>
```
