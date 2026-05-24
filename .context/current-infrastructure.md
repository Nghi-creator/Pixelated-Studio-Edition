# Current Infrastructure Snapshot

Last reviewed: 2026-05-24

## Project Shape

PIXELATED Studio is currently a React + Supabase web app paired with a local Electron desktop orchestrator. The desktop app builds and runs a Docker container that hosts the emulator, captures a virtual display, and streams video/audio to the browser over WebRTC.

Top-level areas:

- `web_server/`: Vite, React 19, TypeScript, Tailwind frontend.
- `app_server/`: Electron desktop app, local Express/Socket.IO bridge, Docker image, GStreamer/Python WebRTC sender.
- `supabase/`: database, storage, RLS, RPC, and realtime migrations.
- `assets/`: README/banner architecture imagery.

## Web App

Runtime stack:

- Vite + React + TypeScript.
- `@supabase/supabase-js` for auth, database, storage, realtime, and RPC calls.
- `socket.io-client` connects directly to the local engine at `http://localhost:8080`.
- The web app centralizes the engine base URL in `web_server/src/lib/engineConfig.ts`; override with `VITE_ENGINE_URL`.
- Routes are declared in `web_server/src/App.tsx`.

Main user-facing routes:

- `/`: cloud game library.
- `/play/:id`: WebRTC player plus reactions/comments.
- `/local`: local vault for uploaded `.nes` files on the local engine.
- `/favorites`, `/profile`, `/publish`, `/login`, `/reset-password`.

Admin routes:

- `/admin`: moderation queue.
- `/admin/users`: user management.
- `/admin/logs`: access logs.

Current important frontend behaviors:

- `useWebRTC` creates an `RTCPeerConnection`, uses Google public STUN, asks Supabase for a selected game's `rom_url` or `rom_filename`, then asks the local Socket.IO engine to start the game.
- Local vault uploads/deletes ROMs by calling the local engine over unauthenticated HTTP with an `X-User-Id` header.
- Publishing uploads ROM/images directly from the browser to Supabase Storage bucket `submissions`, inserts metadata into `game_submissions`, then pings Formspree.
- Session tracking inserts browser-load access logs directly from the client.

## Desktop Orchestrator

Runtime stack:

- Electron app in `app_server/main.js`.
- Renderer files: `app_server/index.html` and `app_server/preload.js`.
- Uses local Docker CLI through `child_process.exec`.

Current lifecycle:

1. User clicks initialize in the Electron UI.
2. Electron checks `docker info`.
3. Electron builds local image `pixelated-engine` from `app_server/Dockerfile`.
4. Electron generates a random pairing token for this engine run.
5. Electron displays the pairing token in the desktop UI.
6. Electron runs a detached container named `pixelated-node` with `-p 127.0.0.1:8080:8080`, publishing the engine only to host loopback, and passes `PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app"` plus `PIXELATED_ENGINE_TOKEN`.
7. On stop/window close, Electron removes `pixelated-node`.

Notable constraints:

- Container name and port are fixed.
- Build happens on user machine from the distributed app folder.
- Old containers are only removed after a failed run attempt, requiring a second initialize click.

## Engine Container

Image base:

- `ubuntu:22.04`.

Installed runtime pieces:

- Xvfb virtual display.
- PulseAudio.
- GStreamer and WebRTC-related plugins.
- Python 3 with `python-socketio[client]`.
- RetroArch.
- Mesen libretro core compiled from source during Docker build.
- Node.js 20.
- Express, Socket.IO, CORS, Multer.

Runtime processes:

- `server.js`: Express + Socket.IO control plane.
- `Xvfb :99`: virtual screen.
- PulseAudio system daemon.
- RetroArch process per game.
- `camera.py`: GStreamer `webrtcbin` sender for X11 capture and PulseAudio monitor.

Data paths:

- Local uploaded ROMs are stored under `/roms/<userId>/`.
- Cloud ROM URLs are downloaded into `/tmp/cloud_game_<uuid>.nes`.

Streaming/signaling:

- Browser connects to Node Socket.IO at `localhost:8080`.
- Node forwards WebRTC offers, answers, and ICE candidates between browser and Python sender inside a Socket.IO room named `session:<id>`.
- Python connects back to Node at `http://localhost:8080`.
- Browser receives VP8 video and Opus audio.
- React generates the current session id, Node passes it into `camera.py` through `PIXELATED_SESSION_ID`, and both browser/camera sockets join the same room before WebRTC negotiation.

Input:

- Browser keydown/keyup events go through Socket.IO.
- Node maps browser keys to X11 key names.
- Node executes `xdotool keydown/keyup` against display `:99`.

## Supabase

Used as the only hosted backend today:

- Auth.
- Postgres tables.
- Storage buckets.
- Realtime publication.
- RPC functions.
- Row Level Security policies.

Core tables inferred from migrations:

- `games`: library metadata, ROM filename/url, cover/backdrop/banner, play count, author/dev metadata.
- `profiles`: auth-linked profile, username, email, avatar, role, ban flag.
- `favorites`: user-game join table.
- `likes`, `comments`, `comment_likes`: social reactions and comments.
- `reported_comments`: moderation queue.
- `access_logs`: page/session logging.
- `game_submissions`: developer upload applications.

Storage buckets inferred from migrations:

- `avatars`: public avatar images.
- `default_library`: public library ROM/media assets.
- `submissions`: public developer submission upload target.
- `web_roms`: private user ROM bucket from a migration, but the current local vault code uses the local Docker engine instead.

Security model today:

- Most app data access happens directly from the browser with the Supabase anon client and RLS.
- Admin pages rely on client-side role checks for routing, while database policies appear to provide the real enforcement.
- Local engine HTTP routes and Socket.IO handshakes require the per-run pairing token generated by Electron.
- The hosted React app stores the pairing token in browser `localStorage` and sends it through `X-Engine-Token` for REST calls and Socket.IO auth for streaming.
- The Python camera bridge receives `PIXELATED_ENGINE_TOKEN` through env and uses it when connecting to Node Socket.IO.
- The Docker port is published only to host loopback and the engine CORS origin is set to the hosted Vercel app by Electron.
- Local vault uploads are limited to `.nes` filenames and capped by `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.

## Deployment Model

Current likely deployment:

- Web frontend hosted on Vercel or similar static hosting.
- Supabase hosted project.
- Local Electron app distributed as `.dmg`, `.exe`, and `.AppImage`.
- Docker engine runs locally on the user's host.
- Browser connects to `localhost:8080`, so the cloud web app depends on a local desktop engine for streaming.

This is closer to a hybrid local cloud-gaming node than a fully hosted cloud-gaming service. That is a valid architecture for developer self-hosting, but it has different scaling needs than a centralized cloud fleet.
