# Pixelated Web

Vite/React frontend for the hosted Pixelated Studio web app.

Run from this folder:

```sh
npm run dev
```

Important env vars:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PUBLIC_APP_URL=https://pixelated-studio-edition.vercel.app
VITE_API_URL=https://pixelated-api-services.onrender.com
VITE_ENGINE_URL=http://localhost:8080
```

Set `VITE_PUBLIC_APP_URL` in Vercel and in Supabase Auth redirect settings so password recovery, email verification, and OAuth callbacks never fall back to localhost.
