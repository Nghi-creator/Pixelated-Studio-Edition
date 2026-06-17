# Project Flows

Last reviewed: 2026-06-17

This file summarizes the runtime flows at a durable level. It intentionally
avoids line-by-line implementation detail.

## Engine Boot

1. Desktop app checks Docker availability.
2. Desktop builds or pulls the engine image.
3. Desktop creates a per-run engine token.
4. Desktop removes stale `pixelated-node` and starts a new container.
5. Local mode publishes `127.0.0.1:8080`; LAN mode publishes `0.0.0.0:8080`.
6. Engine starts Express/Socket.IO and virtual display/audio runtime.
7. Desktop polls `/health`.
8. When healthy, desktop marks the engine ready.
9. In LAN mode, desktop also starts the HTTPS companion with invite/launch
   flows.

## Desktop Launch Pairing

1. Desktop creates a one-use launch ticket.
2. Desktop opens hosted `/engine?companionUrl=...&launchTicket=...`.
3. Web redeems the ticket at the desktop HTTPS companion.
4. Companion returns a host-scoped companion credential, not the raw engine
   token.
5. Web stores the companion URL and `companion:<credential>` locally.
6. Signed-in web registers only non-secret pairing metadata with the hosted API.
7. Web probes companion/engine presence; transient companion probe failures do
   not clear the token, but explicit `401` does.

## LAN Invite Pairing

1. Host enables LAN mode and starts the engine.
2. Desktop shows HTTPS companion URL, QR code, and short-lived invite code.
3. Guest opens the companion URL and accepts/trusts the self-signed certificate
   if needed.
4. Guest page runs preflight: certificate, invite state, host engine health.
5. Guest redeems the invite code.
6. Companion returns a guest-scoped companion credential.
7. Guest web stores `companion:<credential>` and joins through the companion
   proxy.
8. Companion validates the credential and injects the real engine token while
   proxying HTTP and Socket.IO to `127.0.0.1:8080`.

## Cloud Game Boot

1. User opens `/play/:gameId`.
2. Web requires engine pairing first.
3. Web asks hosted API to create a cloud session.
4. API verifies auth, stores session state, and returns a short-lived session
   token plus approved boot metadata.
5. Web connects to the local engine and emits `start-game` with cloud mode and
   session token.
6. Engine verifies the session with the hosted API.
7. Engine ignores browser-supplied cloud ROM targets unless the API verifies
   them.
8. Engine downloads an approved HTTPS ROM target when needed, boots RetroArch,
   and starts the camera/WebRTC sender.

## Local Vault Boot

1. User uploads/list/deletes `.nes` files in `/local`.
2. Web calls the paired local engine with user id and engine auth.
3. Engine stores files under the Docker `pixelated-roms` volume.
4. Opening `/play/<filename>.nes` treats the id as a local vault boot.
5. Engine sanitizes user/file names and boots the local ROM path.

## WebRTC Stream

1. Web creates a session id and RTCPeerConnection.
2. Web asks API for ICE servers; falls back to STUN if unavailable.
3. Web connects to engine Socket.IO with raw token or companion credential.
4. Browser joins a session room.
5. Engine boots game and starts Python/GStreamer camera bridge.
6. Camera joins the same session room.
7. Browser and camera exchange offer/answer/ICE through the engine relay.
8. Browser receives media tracks and marks stream playing.
9. Web samples telemetry locally and sends authenticated snapshots to the API.
10. Engine errors are relayed to the matching session and shown as retryable
    player errors.

## Multiplayer/Lobby

1. Host starts a local or LAN session.
2. Engine tracks lobby participants, host/player/spectator roles, player slots,
   and peer rooms.
3. Guests join through a session URL or LAN companion invite.
4. Guests can request/release slots; input is accepted only for owned slots.
5. Host can kick non-host participants.
6. Signed-in hosts publish non-secret lobby metadata to the API.

## Submission Workflow

1. Signed-in non-super-admin user fills publish form.
2. Browser validates ROM/image type and size.
3. Browser uploads files to the user's `submissions/{userId}/...` Storage path.
4. Browser asks API to create submission metadata and optional notification.
5. If metadata creation fails, browser removes newly uploaded objects.
6. Hosted predeploy verifies the Storage cleanup policy.

## Hosted Deploy Flow

1. Pull request gates run API and hosted-contract checks.
2. Main/manual deploy workflow runs deploy gate.
3. Render and Vercel deploy hooks fire only after the gate passes.
4. Workflow waits for newer Render/Vercel production targets.
5. Signed-in hosted pairing and auth browser smokes validate the live stack.
