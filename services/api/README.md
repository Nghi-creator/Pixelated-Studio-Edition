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
- Placeholder `GET /me` returning `501` until Phase 4 auth is implemented.

Next phase:

- Verify Supabase JWTs.
- Add an authenticated `GET /me`.
- Add a web API client using `VITE_API_URL=http://localhost:4000`.
