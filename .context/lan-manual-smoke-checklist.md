# LAN Multiplayer Manual Smoke Checklist

Last updated: 2026-06-02

Use this checklist for the real two-device LAN validation. The local two-browser smoke has already passed; this checklist is for the host desktop plus a separate guest device.

## Setup

- Host machine has Docker Desktop running.
- Host machine has the latest desktop app build or local `apps/desktop` startup.
- Host and guest are on the same LAN.
- Guest browser is Chrome first; Safari/Firefox can be follow-up compatibility checks.
- Use a real playable ROM if available. A synthetic smoke ROM can prove boot/stream plumbing but not gameplay quality.

## Host Steps

1. Start the desktop app.
2. Enable LAN mode before initializing the engine.
3. Initialize the engine.
4. Confirm the desktop shows:
   - HTTPS companion join URL, usually `https://<host-lan-ip>:8090`.
   - Short-lived invite code.
   - Host-local pairing token with copy warning.
   - LAN warning/checklist copy.
5. Open the host player and start a game.
6. Confirm host stream reaches `LIVE STREAM ACTIVE`.
7. Toggle stream telemetry on.
8. Copy the host telemetry JSON after the guest joins.

## Guest Steps

1. Open the HTTPS companion join URL from the host.
2. Accept the local/self-signed certificate warning if shown.
3. Enter the invite code shown by the desktop app.
4. Join the invite/session as spectator first.
5. Confirm guest stream reaches `LIVE STREAM ACTIVE`.
6. Toggle stream telemetry on.
7. Copy the guest telemetry JSON.
8. Request P2, send a few inputs, then release the slot.
9. Close the guest tab.

## Expected Results

- Guest can load the companion page over HTTPS.
- Guest can redeem the invite code without seeing the raw host pairing token.
- Host stream stays active when guest joins.
- Guest receives video/audio from the same running session.
- Closing the guest tab does not stop the host stream.
- Engine peer count increases when guest joins and returns to baseline after guest disconnects.
- P1/P2 inputs remain slot-authorized.
- If `/dev/uinput` is unavailable, P3/P4 stay disabled with a clear message.

## Record Results

Paste these after the test:

```text
Date/time:
Host OS:
Guest device/browser:
Host LAN URL:
Companion URL:
ROM:

Host result:
Guest result:
Guest disconnect result:
P2 input result:
P3/P4 visible state:
Certificate UX notes:

Host telemetry JSON:

Guest telemetry JSON:

Engine smoke artifact path:
```

## Harness Command

Run this from the repo after the host stream is already active and before the guest joins:

```sh
node scripts/multiplayerSmoke.mjs --engine-url https://<host-lan-ip>:8090 --allow-self-signed --expected-guests 1 --label real-two-device-lan
```

Close the guest tab when the harness prints that join was validated. The harness should then pass after peer count returns to baseline.

## Failure Notes

- Certificate page is too scary/confusing: consider local CA packaging or a tunnel strategy.
- Companion loads but invite redemption fails: check the invite code expiry, LAN mode, and whether the companion can proxy `/health`.
- Pairing says the HTTPS join page cannot be reached: open the companion URL directly and accept the local certificate warning, then retry pairing.
- Pairing says the join page cannot reach the local engine: keep the desktop app open, initialize the engine, and retry after `/health` is ready.
- Hosted Vercel direct-to-LAN HTTP fails: expected in Chrome; use the HTTPS companion instead.
- P3/P4 disabled: expected on Docker Desktop setups without `/dev/uinput`; validate P3/P4 later on a Linux host with uinput access.
