# Project Flows

Last reviewed: 2026-05-31

This file describes the runtime flows in PIXELATED Studio, using `assets/Pixelated.png` plus the current code in `apps/web/` and `apps/desktop/` as the source of truth.

## Main Actors

- React web app: Vite/React UI in `apps/web/src`.
- Supabase: auth, Postgres, storage, realtime, RPCs.
- Electron desktop app: local launcher in `apps/desktop/main.js`.
- Docker engine container: Ubuntu 22.04 image built from `engine/runtime/Dockerfile`.
- Node.js orchestrator: Express + Socket.IO server in `engine/runtime/server.js`.
- RetroArch/Mesen: native emulator process inside the container.
- Xvfb: virtual X11 display inside the container.
- PulseAudio: virtual audio output inside the container.
- GStreamer/Python bridge: WebRTC media sender in `engine/runtime/camera.py`.
- Browser `RTCPeerConnection`: WebRTC receiver created by `apps/web/src/lib/useWebRTC.ts`.

## 1. Engine Boot Flow

Purpose: start the local Dockerized game streaming node.

1. User opens the Electron desktop app.
2. Electron renderer calls `window.electronAPI.startDocker()`.
3. `preload.js` forwards the request to Electron main over IPC event `start-docker`.
4. `main.js` runs `docker info` to check whether Docker is available.
5. `main.js` builds the image with `docker build -t pixelated-engine .` from `engine/runtime/`.
6. Electron generates a random pairing token for this engine run.
7. Electron sends the token to the desktop renderer, which displays it for host-local use with a warning not to share it with LAN guests.
8. `main.js` removes any stale `pixelated-node` container.
9. `main.js` starts a detached container. In local mode it uses `-p 127.0.0.1:8080:8080`; in explicit LAN mode it uses `-p 0.0.0.0:8080:8080`. The command also mounts `-v pixelated-roms:/roms` and passes `PIXELATED_ALLOWED_ORIGINS`, `PIXELATED_ALLOWED_ROM_HOSTS`, `PIXELATED_API_URL`, `PIXELATED_ENGINE_TOKEN`, `PIXELATED_ENGINE_EXPOSURE_MODE`, and `PIXELATED_ADVERTISED_URLS`.
10. The container starts `node server.js`.
11. `server.js` listens on `0.0.0.0:8080`.
12. On server start, `server.js` calls `startVirtualDisplay()`.
13. `startVirtualDisplay()` removes stale X11 lock files, starts `Xvfb :99`, starts PulseAudio, and writes `/app/retroarch.cfg`.
14. Electron polls `http://127.0.0.1:8080/health`.
15. `/health` checks Xvfb, PulseAudio startup, RetroArch binary/config/core, Python/GStreamer bridge presence, and `/roms` writability.
16. If health returns `ok: true` and LAN mode is enabled, Electron starts the LAN HTTPS companion server with a 10-minute invite code.
17. The companion serves the React production build from `apps/web/dist` in development or `resources/web-dist` in packaged builds, then proxies engine HTTP and Socket.IO/WebSocket traffic to `127.0.0.1:8080`.
18. LAN guests redeem the invite code with `POST /invite/redeem`; the companion returns a short-lived companion credential and maps it to the real engine token while proxying.
19. If health returns `ok: true`, Electron marks the engine as successful.
20. If health times out or engine startup fails, Electron removes `pixelated-node` and returns the UI to stopped state.
21. Electron displays log messages from the Docker lifecycle back in the desktop UI.

Current limitation: health is still readiness-focused. It does not yet expose live stream telemetry such as FPS, bitrate, ICE state, or encoder errors.

Security note: the Node server still listens on `0.0.0.0` inside the container. Docker publishes it only to `127.0.0.1` by default. Publishing to LAN requires the explicit desktop LAN mode toggle.

## 2. Cloud Library Game Boot Flow

Purpose: boot an approved/public game selected from the web library.

1. User navigates to `/play/:id` in React.
2. `Player.tsx` calls `useWebRTC(id)`.
3. `useWebRTC` connects Socket.IO to `http://localhost:8080`.
4. On socket `connect`, `resolveGameBootTarget()` asks Supabase auth for the current session.
5. If `id` is not a `.nes` filename, `resolveGameBootTarget()` calls backend `POST /sessions`.
6. Backend verifies the Supabase bearer token, resolves `games.rom_url || games.rom_filename`, stores the session with a hashed `sessionToken`, and returns the approved boot target.
7. React emits Socket.IO event `start-game` with `{ mode: "cloud", sessionId, sessionToken, romFilename, userId }`.
8. `server.js` receives `start-game`.
9. If `mode: "cloud"` or `sessionToken` exists, Node treats the event as backend session intent and calls `POST /sessions/:sessionId/verify` through `PIXELATED_API_URL`.
10. Backend verifies the token and returns the approved boot target plus session mode.
11. Node requires the verified backend session mode to be `cloud`.
12. Node replaces the browser-supplied ROM target with the verified backend target.
13. If a cloud intent or cloud URL arrives without a valid backend session token, Node emits `engine-error` and refuses to boot it.
14. If the verified boot target starts with `http`, Node treats it as a cloud ROM URL.
15. Node validates that the URL is parseable.
16. Node requires the URL to use HTTPS.
17. Node checks the hostname against `PIXELATED_ALLOWED_ROM_HOSTS` when configured.
18. Node downloads the ROM with `https.get()` into `/tmp/cloud_game_<uuid>.nes`.
19. Node enforces `PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES`, defaulting to 8 MiB.
20. Node enforces `PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS`, defaulting to 15 seconds.
21. If validation or download fails, Node removes the temp file and emits `engine-error` to React.
22. After download finishes, Node calls `bootGame(tmpPath)`.
23. `bootGame()` kills any previous RetroArch and camera processes and removes any previous active temp cloud ROM.
24. `bootGame()` spawns RetroArch with:
    - full-screen mode,
    - Mesen libretro core at `/cores/mesen_libretro.so`,
    - config `/app/retroarch.cfg`,
    - downloaded ROM path,
    - `DISPLAY=:99`,
    - `PULSE_SERVER=127.0.0.1`.
25. After a 1 second delay, Node starts `python3 -u camera.py`.

Current limitation: a signed-in hosted browser smoke test is still needed after redeploying the API and engine changes.

## 3. Local Vault Game Boot Flow

Purpose: boot a `.nes` file that the user previously uploaded to the local container.

1. User navigates to `/local`.
2. `LocalVault.tsx` gets the current Supabase session.
3. React calls `GET http://localhost:8080/local-games` with `X-User-Id`.
4. `server.js` sanitizes the user id and maps it to `/roms/<userId>/`.
5. Node lists `.nes` files in that folder and returns filenames.
6. User clicks a local game, navigating to `/play/<filename>.nes`.
7. `resolveGameBootTarget()` treats any `.nes` id as a local vault file.
8. React emits `start-game` with `{ mode: "local", romFilename: filename, userId }`.
9. Node sanitizes the user id and ROM filename.
10. Node calls `bootGame("/roms/<userId>/<filename>")`.
11. Boot continues through the same RetroArch and camera process flow as a cloud game.

Current limitation: the pairing token proves possession of the local engine token, but user identity is still trusted from the `X-User-Id` header or socket payload instead of a verified Supabase JWT.

## 4. Local Vault Upload/Delete Flow

Purpose: manage user-local ROM files inside the engine container.

Upload:

1. User drags or selects a `.nes` file in `/local`.
2. React checks that the filename ends with `.nes`.
3. React requires the local engine pairing panel to have saved a desktop pairing token in browser `localStorage`.
4. React sends `POST http://localhost:8080/upload` with multipart field `romFile`, `X-User-Id`, and `X-Engine-Token`.
5. Node rejects the request if the pairing token does not match `PIXELATED_ENGINE_TOKEN`.
6. Multer rejects files that do not have a `.nes` filename.
7. Multer rejects files larger than `PIXELATED_MAX_ROM_SIZE_BYTES`, defaulting to 8 MiB.
8. Multer stores the file under `/roms/<safeUserId>/<timestamp>-<uuid>-<basename(originalname)>`.
9. Node returns `{ success: true, filename }`.
10. React refetches the local game list.

Delete:

1. User clicks delete on a local game.
2. React sends `DELETE http://localhost:8080/local-games/:filename` with `X-User-Id` and `X-Engine-Token`.
3. Node rejects the request if the pairing token does not match `PIXELATED_ENGINE_TOKEN`.
4. Node decodes and sanitizes the filename with `path.basename`.
5. Node deletes `/roms/<safeUserId>/<safeName>` if it exists.
6. React refetches the local game list.

Storage note: `/roms` is backed by the named Docker volume `pixelated-roms`, so uploaded Local Vault ROMs survive container replacement.

## 5. WebRTC Signaling Flow

Purpose: negotiate a WebRTC connection between browser and GStreamer.

1. `createWebRTCSessionId()` creates a per-player `sessionId`.
2. `useWebRTC` calls `GET /webrtc/ice-servers` on the API to load STUN/TURN config. If the API is unavailable or the user is unsigned, React falls back to Google STUN.
3. `createEnginePeerConnection()` creates an `RTCPeerConnection` with that ICE config.
4. React reads the desktop pairing token from browser `localStorage`; if it is missing, the player shows the local engine pairing panel.
5. React connects to Node Socket.IO with `{ auth: { token } }`.
6. Node rejects the socket if the token does not match `PIXELATED_ENGINE_TOKEN`.
7. React emits `join-session` with `{ sessionId, role: "browser" }`.
8. Node joins that browser socket to room `session:<sessionId>`.
9. React emits `start-game` with the same `sessionId` and ICE config; cloud starts include `mode: "cloud"` and `sessionToken`, while Local Vault starts include `mode: "local"` and no backend token.
10. Node validates the ICE config and keeps only STUN/TURN URL, username, and credential fields.
11. Node boots RetroArch and then starts `camera.py` with `PIXELATED_SESSION_ID=<sessionId>`, `PIXELATED_ENGINE_TOKEN=<token>`, and `PIXELATED_ICE_SERVERS=<json>`.
12. `camera.py` connects back to `http://localhost:8080` as a Socket.IO client with the token.
13. Python emits `join-session` with `{ sessionId, role: "camera" }`.
14. Node joins that camera socket to room `session:<sessionId>`.
15. Python emits `python-ready` with the same `sessionId`.
16. Node relays `python-ready` only to sockets in `session:<sessionId>`.
17. React receives `python-ready`.
18. `createAndSendOffer()` adds recv-only video and audio transceivers.
19. `createAndSendOffer()` creates a WebRTC offer and sets it as the local description.
20. React emits `webrtc-offer` with `sessionId`.
21. Node relays the offer only to `session:<sessionId>`.
22. Python receives the offer.
23. Python builds the GStreamer pipeline, gets the `webrtcbin` element, and configures the same STUN/TURN servers.
24. Python sets the React offer as the remote description.
25. Python creates a WebRTC answer.
26. Python sets the answer as its local description.
27. Python emits `webrtc-answer` with `sessionId`.
28. Node relays the answer only to `session:<sessionId>`.
29. React sets the answer as its remote description.
30. React and Python exchange ICE candidates through `webrtc-ice-candidate` and `webrtc-ice-candidate-backend` events relayed only inside the same session room.
31. Once media tracks arrive, React adds them to a `MediaStream` and marks status as `playing`.
32. `startWebRTCTelemetry()` polls `RTCPeerConnection.getStats()` once per second.
33. `useWebRTC` returns stream telemetry alongside `stream` and `status`.
34. `Player.tsx` assigns that `MediaStream` to the `<video>` element through `videoRef.current.srcObject`.
35. `Player.tsx` hides received FPS, bitrate, ICE state, packet loss, and jitter by default.
36. If the user enables the telemetry toggle, `Player.tsx` renders those metrics below the video and persists that preference in `localStorage`.

Current limitation: signaling is room-scoped and token-gated, and ICE config can now come from the backend. Production still needs a real TURN provider configured in API env vars.

## 5B. Local Engine Pairing Flow

Purpose: make local-engine intent explicit without sending the desktop pairing token to the hosted backend.

1. Electron starts the local engine and displays a per-run pairing token.
2. React renders `EnginePairingPanel` in Local Vault and when the player needs a token.
3. User enters the local engine URL and desktop pairing token.
4. React classifies the URL as local, LAN, or custom based on hostname.
5. React calls `GET <engineUrl>/health` without the token to verify the engine is reachable.
6. If the URL looks like LAN but `/health` reports `exposureMode: "local"`, React rejects pairing and tells the user to enable LAN mode in the desktop app.
7. React calls `GET <engineUrl>/local-games` with `X-Engine-Token` and a pairing-check user id to verify the token.
8. React stores the engine URL and pairing token in browser `localStorage`.
9. If the user is signed in, React calls `POST /local-pairings` on the backend with only `{ engineUrl }`.
10. Backend persists pairing intent metadata for the authenticated user in `local_engine_pairings`.
11. Backend does not receive or store the desktop pairing token.
12. Local Vault uses the stored token for `X-Engine-Token` on upload/list/delete requests.
13. WebRTC uses the stored token for Socket.IO auth.
14. If the engine rejects the token, React clears it and shows the pairing panel again.
15. If a hosted HTTPS browser cannot reach an HTTP LAN engine URL, React shows a private-network/mixed-content oriented error instead of a generic unreachable message.

LAN HTTPS companion join variant:

1. Electron starts LAN mode and shows the HTTPS companion join URL plus a short-lived invite code.
2. The companion-served React app detects the `https://<host-lan-ip>:8090` engine URL and shows an invite-code join UI instead of the raw pairing token field.
3. React calls `POST <companionUrl>/invite/redeem` with the invite code.
4. The companion validates the code locally, returns a short-lived companion credential, and never sends the raw engine token to the guest.
5. React stores the engine URL plus `companion:<credential>` in browser `localStorage`.
6. REST calls send the companion credential through `X-Engine-Token`; Socket.IO joins send it as a `companionToken` query parameter.
7. The companion validates the credential and injects the host-local engine token while proxying to `127.0.0.1:8080`.

## 5A. Live Stream Telemetry And Error Flow

Purpose: surface stream quality and engine failures while a player session is active.

1. `useWebRTC` creates an `RTCPeerConnection`.
2. `startWebRTCTelemetry()` registers ICE and peer connection state listeners.
3. `startWebRTCTelemetry()` calls `getStats()` every second.
4. React reads inbound RTP reports.
5. React calculates received bitrate from inbound byte deltas.
6. React reads inbound video `framesPerSecond` when the browser exposes it.
7. React sums packet loss and converts jitter to milliseconds.
8. `useWebRTC` stores the latest telemetry snapshot in React state.
9. `Player.tsx` keeps FPS, bitrate, ICE state, packet loss, and jitter hidden by default.
10. The player telemetry toggle persists in `localStorage`.
11. `useWebRTC` sends a sampled telemetry snapshot to `POST /metrics/stream` at most every five seconds.
12. Backend validates the metric and rate-limits accepted samples per authenticated user/session using the latest persisted sample.
13. Backend stores accepted samples in `stream_metrics`.
14. When the toggle is enabled, `Player.tsx` displays the live telemetry strip below the video.
15. `camera.py` watches the GStreamer bus for error messages.
16. On a GStreamer error, Python emits `engine-error` with `sessionId`, message, and source.
17. `server.js` relays that error to the matching `session:<sessionId>` room.
18. React receives `engine-error`, stores it as `lastEngineError`, and moves the player to error state.
19. The normal player error overlay stays simple; technical engine detail appears only when the telemetry toggle is enabled.

Current limitation: backend telemetry is persisted in Supabase, but it still needs retention cleanup and richer dashboards before fleet scheduling.

## 6. Video Buffer Flow

Purpose: move rendered game frames from RetroArch to the browser.

1. RetroArch runs inside the Docker container with `DISPLAY=:99`.
2. RetroArch/Mesen renders game frames into the X11 display.
3. Xvfb provides the virtual framebuffer for display `:99`.
4. `camera.py` starts a GStreamer pipeline after receiving the WebRTC offer.
5. GStreamer `ximagesrc display-name=:99 use-damage=false show-pointer=false` captures raw frames from Xvfb.
6. GStreamer constrains video to the selected stream profile framerate, currently 30 or 60 fps.
7. `videoconvert` converts frames.
8. Caps force `video/x-raw,format=I420`.
9. A leaky queue keeps latency low by dropping stale frames under pressure.
10. `vp8enc` encodes frames as VP8 with low-latency settings:
    - `deadline=1`,
    - `cpu-used=8`,
    - `threads=4`,
    - constant bitrate target from the selected stream profile, currently 700, 1000, or 1600 kbps,
    - keyframe distance `120`,
    - error resilience enabled.
11. `rtpvp8pay pt=96` packetizes VP8 into RTP.
12. RTP video enters `webrtcbin`.
13. WebRTC transports the VP8 RTP stream to the browser.
14. Browser WebRTC stack decodes the received video track.
15. React receives the track in `pc.ontrack`, adds it to a `MediaStream`, and displays it in the `<video>` element.

Short version:

`RetroArch -> Xvfb :99 -> ximagesrc -> videoconvert/I420 -> VP8 encoder -> RTP payloader -> webrtcbin -> WebRTC -> browser MediaStream -> React video element`

## 7. Audio Buffer Flow

Purpose: move emulator audio from RetroArch to the browser.

1. `startVirtualDisplay()` writes `audio_driver = "pulse"` into `/app/retroarch.cfg`.
2. RetroArch starts with `PULSE_SERVER=127.0.0.1`.
3. RetroArch sends audio output to PulseAudio.
4. PulseAudio exposes the monitor source `auto_null.monitor`.
5. `camera.py` GStreamer pipeline captures audio with `pulsesrc device=auto_null.monitor provide-clock=false`.
6. `audioconvert` converts audio format as needed.
7. `audioresample` resamples audio as needed.
8. A small leaky queue limits audio backlog.
9. `opusenc` encodes audio as Opus.
10. `rtpopuspay pt=111` packetizes Opus into RTP.
11. RTP audio enters `webrtcbin`.
12. WebRTC transports the Opus RTP stream to the browser.
13. Browser WebRTC stack decodes the received audio track.
14. React receives the track in `pc.ontrack`, adds it to the same `MediaStream`, and the `<video>` element plays audio with the stream.

Short version:

`RetroArch -> PulseAudio -> auto_null.monitor -> pulsesrc -> audioconvert/audioresample -> Opus encoder -> RTP payloader -> webrtcbin -> WebRTC -> browser MediaStream -> React video element audio`

## 8. Controller Input Flow

Purpose: move keyboard control from browser to the emulator.

1. `attachEngineInput()` attaches browser `keydown` and `keyup` listeners to `window`.
2. `Player.tsx` separately prevents page scrolling for arrow keys and space when focus is not inside an input or textarea.
3. On keydown, `attachEngineInput()` ignores repeated keydown events.
4. React emits Socket.IO event `keydown` with `{ sessionId, key: e.key }`.
5. On keyup, React emits Socket.IO event `keyup` with `{ sessionId, key: e.key }`.
6. Node receives the event in `server.js`.
7. Node maps browser keys through `translateKey()`:
    - `ArrowUp -> Up`
    - `ArrowDown -> Down`
    - `ArrowLeft -> Left`
    - `ArrowRight -> Right`
    - `z -> z`
    - `x -> x`
    - `Enter -> Return`
    - `Shift -> Shift_R`
8. Unknown keys are ignored.
9. Node ignores input if the event's `sessionId` does not match the active engine session.
10. Node runs `DISPLAY=:99 xdotool keydown <linuxKey>` or `DISPLAY=:99 xdotool keyup <linuxKey>`.
11. `xdotool` injects the key event into Xvfb display `:99`.
12. RetroArch receives the key event from the X11 environment.
13. RetroArch maps that input to emulator controls and updates game state.
14. Updated game state produces new video/audio frames, which return through the media flows above.

Short version:

`Browser keyboard -> React window listener -> Socket.IO -> Node translateKey -> xdotool -> Xvfb :99 -> RetroArch input -> game state`

## 9. Supabase Auth/Profile Flow

Purpose: authenticate users and attach app metadata.

1. User signs up or signs in through React pages using `supabase.auth`.
2. Supabase Auth creates or returns a user session.
3. Migrations define a trigger that creates a row in `profiles` for new auth users.
4. React components call `supabase.auth.getSession()` to determine current user.
5. Profile data is read/written in `profiles`.
6. Navbar and admin layout use profile fields such as `role` and `is_banned`.
7. Admin pages check `role` client-side before rendering admin routes.
8. Supabase RLS policies are expected to enforce the real data boundary.

## 10. Game Library/Favorites Flow

Purpose: show the game catalog and user favorites.

1. Landing/library components query Supabase `games`.
2. Game cards display title, cover/backdrop, author, and play metadata.
3. User favorite state is read from `favorites`.
4. Favorite/unfavorite writes go directly from React to Supabase.
5. Realtime is enabled for `favorites`, so favorites pages can update from Supabase realtime events.

## 11. Social Comments/Reactions Flow

Purpose: support game likes, dislikes, comments, comment reactions, and reports.

Game reactions:

1. `Player.tsx` reads all `likes` for a game.
2. React calculates like/dislike counts client-side.
3. User reaction writes insert/delete rows in `likes`.
4. React refetches reactions.

Comments:

1. `Player.tsx` queries `comments` with nested `profiles` and `comment_likes`.
2. User submits a comment by inserting into `comments`.
3. User deletes own comment by deleting from `comments`.
4. User reacts to comments by inserting/deleting rows in `comment_likes`.

Reports:

1. User reports a comment by inserting into `reported_comments`.
2. Admin dashboard reads `reported_comments` with nested comment/profile data.
3. Admin actions delete report rows, delete comments, or update a profile's `is_banned` flag.

## 12. Play Count Flow

Purpose: count a play after a user stays on the player long enough.

1. `Player.tsx` starts a 30 second timer when an `id` is present.
2. When the timer fires, React calls Supabase RPC `increment_play_count`.
3. The RPC increments `games.play_count`.
4. If the component unmounts before 30 seconds, the timer is cleared.

Current limitation: this is client initiated, so it is useful as a product signal but not strong enough for abuse-resistant analytics.

## 13. Developer Publishing Flow

Purpose: let developers submit homebrew games for review.

1. User opens `/publish`.
2. User fills developer name, contact email, title, description, ROM, and optional images.
3. React validates the ROM filename ends with `.nes`.
4. React validates image files by browser MIME type.
5. React uploads files directly to Supabase Storage bucket `submissions`.
6. React obtains public URLs for uploaded files.
7. React inserts submission metadata into `game_submissions`.
8. React sends a Formspree POST to notify admins by email.
9. Admins review externally or through future tooling.

Current limitation: public client-side uploads need backend validation/rate limits before serious public launch.

## 14. Access Log Flow

Purpose: record a simple visit/session signal.

1. `SessionTracker` runs once inside `App.tsx`.
2. `useSessionTracker` gets the current Supabase session.
3. It builds a `sessionStorage` key for either a user id or guest.
4. If the key was not logged in the current browser session, React inserts a row into `access_logs`.
5. On auth sign-in/sign-out events, it logs the new auth state once.
6. Admin access logs page reads `access_logs` through Supabase.

Current limitation: logging is client initiated and can be skipped or spoofed. It is adequate for rough dashboard activity, not authoritative analytics.

## 15. Shutdown Flow

Purpose: stop the local engine.

1. User clicks stop in the Electron app, or closes the desktop window.
2. Electron main handles `stop-docker` or `window-all-closed`.
3. Electron runs `docker rm -f pixelated-node`.
4. Docker stops/removes the running engine container.
5. RetroArch, Python/GStreamer, Xvfb, PulseAudio, and Node all terminate with the container.

## 16. Player Session Cleanup Flow

Purpose: stop the current local game session when the React player unmounts.

1. `useWebRTC` cleanup closes the current `RTCPeerConnection`.
2. React emits `stop-session` with the current `sessionId`.
3. Node verifies that the session id matches the active engine session.
4. Node kills the active RetroArch process.
5. Node kills the active Python/GStreamer camera process.
6. If the active game used a temp cloud ROM, Node deletes that temp file.
7. Node clears `activeSessionId` and the active temp ROM pointer.

Current limitation: cleanup is designed for the current one-active-session local engine model.

## Missing Or Implicit Flows Worth Adding Later

- Engine health flow: React/Electron should be able to ask whether the container is truly ready.
- Pairing/auth flow: React web app should prove it is allowed to talk to the local engine.
- Session ownership flow: all socket events should carry or derive a session id.
- TURN credential flow: backend should mint short-lived credentials for production WebRTC.
- Engine/node capacity flow: hosted nodes should report whether they can accept sessions.
- Observability persistence flow: send session start/stop, ICE failures, encoder health, FPS/bitrate, and crash logs to a backend metrics store.
- Cleanup flow: old local vault files need explicit lifecycle rules if storage quotas become important.
