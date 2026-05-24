# Project Flows

Last reviewed: 2026-05-24

This file describes the runtime flows in PIXELATED Studio, using `assets/Pixelated.png` plus the current code in `web_server/` and `app_server/` as the source of truth.

## Main Actors

- React web app: Vite/React UI in `web_server/src`.
- Supabase: auth, Postgres, storage, realtime, RPCs.
- Electron desktop app: local launcher in `app_server/main.js`.
- Docker engine container: Ubuntu 22.04 image built from `app_server/Dockerfile`.
- Node.js orchestrator: Express + Socket.IO server in `app_server/server.js`.
- RetroArch/Mesen: native emulator process inside the container.
- Xvfb: virtual X11 display inside the container.
- PulseAudio: virtual audio output inside the container.
- GStreamer/Python bridge: WebRTC media sender in `app_server/camera.py`.
- Browser `RTCPeerConnection`: WebRTC receiver created by `web_server/src/lib/useWebRTC.ts`.

## 1. Engine Boot Flow

Purpose: start the local Dockerized game streaming node.

1. User opens the Electron desktop app.
2. Electron renderer calls `window.electronAPI.startDocker()`.
3. `preload.js` forwards the request to Electron main over IPC event `start-docker`.
4. `main.js` runs `docker info` to check whether Docker is available.
5. `main.js` builds the image with `docker build -t pixelated-engine .` from `app_server/`.
6. Electron generates a random pairing token for this engine run.
7. Electron sends the token to the desktop renderer, which displays it with a copy button.
8. `main.js` removes any stale `pixelated-node` container.
9. `main.js` starts a detached container with `docker run -d --name pixelated-node -p 127.0.0.1:8080:8080 -v pixelated-roms:/roms -e PIXELATED_ALLOWED_ORIGINS="https://pixelated-studio-edition.vercel.app" -e PIXELATED_ALLOWED_ROM_HOSTS="pxksbsloksyfwiqyfkrz.supabase.co" -e PIXELATED_ENGINE_TOKEN="<token>" pixelated-engine`.
10. The container starts `node server.js`.
11. `server.js` listens on `0.0.0.0:8080`.
12. On server start, `server.js` calls `startVirtualDisplay()`.
13. `startVirtualDisplay()` removes stale X11 lock files, starts `Xvfb :99`, starts PulseAudio, and writes `/app/retroarch.cfg`.
14. Electron polls `http://127.0.0.1:8080/health`.
15. If health returns `ok: true`, Electron marks the engine as successful.
16. If health times out, Electron removes `pixelated-node` and returns the UI to stopped state.
17. Electron displays log messages from the Docker lifecycle back in the desktop UI.

Current limitation: health currently confirms the Node engine is serving. It does not yet verify Xvfb, PulseAudio, RetroArch, or the Python/GStreamer bridge.

Security note: the Node server still listens on `0.0.0.0` inside the container, but Docker publishes it only to `127.0.0.1` on the host.

## 2. Cloud Library Game Boot Flow

Purpose: boot an approved/public game selected from the web library.

1. User navigates to `/play/:id` in React.
2. `Player.tsx` calls `useWebRTC(id)`.
3. `useWebRTC` connects Socket.IO to `http://localhost:8080`.
4. On socket `connect`, React asks Supabase auth for the current session.
5. If `id` is not a `.nes` filename, React queries Supabase table `games` for `rom_url` and `rom_filename`.
6. React picks `rom_url || rom_filename`.
7. React emits Socket.IO event `start-game` with `{ romFilename, userId }`.
8. `server.js` receives `start-game`.
9. If `romFilename` starts with `http`, Node treats it as a cloud ROM URL.
10. Node validates that the URL is parseable.
11. Node requires the URL to use HTTPS.
12. Node checks the hostname against `PIXELATED_ALLOWED_ROM_HOSTS` when configured.
13. Node downloads the ROM with `https.get()` into `/tmp/cloud_game_<uuid>.nes`.
14. Node enforces `PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES`, defaulting to 8 MiB.
15. Node enforces `PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS`, defaulting to 15 seconds.
16. If validation or download fails, Node removes the temp file and emits `engine-error` to React.
17. After download finishes, Node calls `bootGame(tmpPath)`.
18. `bootGame()` kills any previous RetroArch and camera processes.
19. `bootGame()` spawns RetroArch with:
    - full-screen mode,
    - Mesen libretro core at `/cores/mesen_libretro.so`,
    - config `/app/retroarch.cfg`,
    - downloaded ROM path,
    - `DISPLAY=:99`,
    - `PULSE_SERVER=127.0.0.1`.
20. After a 1 second delay, Node starts `python3 -u camera.py`.

Current limitation: the local engine now validates HTTPS, hostname, size, and timeout, but it still receives a URL from the browser. A future backend should resolve game ids to approved signed ROM manifests.

## 3. Local Vault Game Boot Flow

Purpose: boot a `.nes` file that the user previously uploaded to the local container.

1. User navigates to `/local`.
2. `LocalVault.tsx` gets the current Supabase session.
3. React calls `GET http://localhost:8080/local-games` with `X-User-Id`.
4. `server.js` sanitizes the user id and maps it to `/roms/<userId>/`.
5. Node lists `.nes` files in that folder and returns filenames.
6. User clicks a local game, navigating to `/play/<filename>.nes`.
7. `useWebRTC` treats any `.nes` id as a local vault file.
8. React emits `start-game` with `{ romFilename: filename, userId }`.
9. Node sanitizes the user id and ROM filename.
10. Node calls `bootGame("/roms/<userId>/<filename>")`.
11. Boot continues through the same RetroArch and camera process flow as a cloud game.

Current limitation: user identity is trusted from the `X-User-Id` header or socket payload. There is no pairing token or JWT verification at the local engine boundary.

## 4. Local Vault Upload/Delete Flow

Purpose: manage user-local ROM files inside the engine container.

Upload:

1. User drags or selects a `.nes` file in `/local`.
2. React checks that the filename ends with `.nes`.
3. React ensures it has a pairing token in `localStorage`; if not, it prompts the user to enter the token shown in the desktop app.
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

1. React creates an `RTCPeerConnection` with Google STUN.
2. React creates a per-player `sessionId`.
3. React ensures it has a pairing token in `localStorage`; if not, it prompts the user to enter the token shown in the desktop app.
4. React connects to Node Socket.IO with `{ auth: { token } }`.
5. Node rejects the socket if the token does not match `PIXELATED_ENGINE_TOKEN`.
6. React emits `join-session` with `{ sessionId, role: "browser" }`.
7. Node joins that browser socket to room `session:<sessionId>`.
8. React emits `start-game` with the same `sessionId`.
9. Node boots RetroArch and then starts `camera.py` with `PIXELATED_SESSION_ID=<sessionId>` and `PIXELATED_ENGINE_TOKEN=<token>`.
10. `camera.py` connects back to `http://localhost:8080` as a Socket.IO client with the token.
11. Python emits `join-session` with `{ sessionId, role: "camera" }`.
12. Node joins that camera socket to room `session:<sessionId>`.
13. Python emits `python-ready` with the same `sessionId`.
14. Node relays `python-ready` only to sockets in `session:<sessionId>`.
15. React receives `python-ready`.
16. React adds recv-only video and audio transceivers.
17. React creates a WebRTC offer and sets it as the local description.
18. React emits `webrtc-offer` with `sessionId`.
19. Node relays the offer only to `session:<sessionId>`.
20. Python receives the offer.
21. Python builds the GStreamer pipeline and gets the `webrtcbin` element.
22. Python sets the React offer as the remote description.
23. Python creates a WebRTC answer.
24. Python sets the answer as its local description.
25. Python emits `webrtc-answer` with `sessionId`.
26. Node relays the answer only to `session:<sessionId>`.
27. React sets the answer as its remote description.
28. React and Python exchange ICE candidates through `webrtc-ice-candidate` and `webrtc-ice-candidate-backend` events relayed only inside the same session room.
29. Once media tracks arrive, React adds them to a `MediaStream` and marks status as `playing`.
30. `Player.tsx` assigns that `MediaStream` to the `<video>` element through `videoRef.current.srcObject`.

Current limitation: signaling is now room-scoped and token-gated, but it is still local pairing rather than backend-issued session authorization.

## 6. Video Buffer Flow

Purpose: move rendered game frames from RetroArch to the browser.

1. RetroArch runs inside the Docker container with `DISPLAY=:99`.
2. RetroArch/Mesen renders game frames into the X11 display.
3. Xvfb provides the virtual framebuffer for display `:99`.
4. `camera.py` starts a GStreamer pipeline after receiving the WebRTC offer.
5. GStreamer `ximagesrc display-name=:99 use-damage=false show-pointer=false` captures raw frames from Xvfb.
6. GStreamer constrains video to `video/x-raw,framerate=60/1`.
7. `videoconvert` converts frames.
8. Caps force `video/x-raw,format=I420`.
9. A leaky queue keeps latency low by dropping stale frames under pressure.
10. `vp8enc` encodes frames as VP8 with low-latency settings:
    - `deadline=1`,
    - `cpu-used=8`,
    - `threads=4`,
    - constant bitrate target `1000000`,
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

1. `useWebRTC` attaches browser `keydown` and `keyup` listeners to `window`.
2. `Player.tsx` separately prevents page scrolling for arrow keys and space when focus is not inside an input or textarea.
3. On keydown, `useWebRTC` ignores repeated keydown events.
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

Current limitation: cloud temp ROM cleanup relies on container lifecycle unless explicit cleanup is added.

## Missing Or Implicit Flows Worth Adding Later

- Engine health flow: React/Electron should be able to ask whether the container is truly ready.
- Pairing/auth flow: React web app should prove it is allowed to talk to the local engine.
- Session ownership flow: all socket events should carry or derive a session id.
- TURN credential flow: backend should mint short-lived credentials for production WebRTC.
- Engine/node capacity flow: hosted nodes should report whether they can accept sessions.
- Observability flow: collect session start/stop, ICE failures, encoder health, FPS/bitrate, and crash logs.
- Cleanup flow: temp ROMs, stale processes, stale containers, and old local vault files need explicit lifecycle rules.
