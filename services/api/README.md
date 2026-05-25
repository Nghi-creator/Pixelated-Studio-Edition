# Pixelated API

Localhost backend control-plane skeleton for Pixelated Studio.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local env file:

   ```bash
   cp .env.example .env
   ```

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

## Current Scope

Phase 3 only adds the local API service shell. It does not route web app behavior through the backend yet.

Implemented now:

- Fastify server bootstrap.
- Environment parsing.
- CORS for localhost web and hosted Vercel origin.
- `GET /health`.
- Supabase JWT verification middleware.
- Authenticated `GET /me`.
- Authenticated `GET /me/permissions`.
- Supabase anon/service clients.

Next phase:

- Move low-risk mutations through the backend.

## Auth Routes

Auth routes expect:

```text
Authorization: Bearer <supabase-access-token>
```

Routes:

```text
GET /me
GET /me/permissions
```

If Supabase env vars are missing, authenticated routes return `503`.
