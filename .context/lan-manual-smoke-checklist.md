# LAN Manual Smoke Checklist

Last reviewed: 2026-07-22

Keep this file: it is the manual two-device validation runbook that automated
tests cannot replace.

## Setup

- Host and guest are on the same LAN.
- Host has Docker Desktop running.
- Host uses latest desktop build or local `apps/desktop` startup.
- Guest browser is Chrome first.
- Use a real playable ROM if available.

## Host

1. Start desktop app.
2. Enable LAN mode before initializing engine.
3. Initialize engine.
4. Confirm desktop shows:
   - HTTPS companion URL.
   - QR code.
   - invite code.
   - host-local pairing token.
   - LAN warning/checklist copy.
5. Start a game as host.
6. Confirm stream reaches `LIVE STREAM ACTIVE`.
7. Toggle stream telemetry on.
8. During active smoke run, save host Stream Stats.
9. Regenerate invite and confirm the engine stays running.
10. Revoke invite and confirm redemption fails closed.
11. Regenerate invite before any new guest join attempt.

## Guest

1. Open companion URL from QR or copied URL.
2. Accept/trust self-signed certificate if prompted.
3. Confirm preflight shows:
   - certificate accepted.
   - invite active.
   - host engine available.
4. Enter invite code and join as spectator first.
5. Confirm guest stream reaches `LIVE STREAM ACTIVE`.
6. Toggle telemetry and save guest Stream Stats.
7. Request P2, send input, then release slot.
8. Close guest tab.

## Expected Results

- Guest never sees the raw host-local pairing token.
- Invite redemption works only while invite is active.
- Host can regenerate/revoke invite without restarting engine.
- Host stream survives guest join/disconnect.
- Peer count rises on guest join and returns to baseline on disconnect.
- P1/P2 inputs stay slot-authorized.
- P3/P4 are disabled with clear copy when `/dev/uinput` is unavailable.

## Harness

Run after host stream is active and before guest joins:

```sh
node scripts/lan/multiplayerSmoke.mjs \
  --engine-url https://<host-lan-ip>:8090 \
  --allow-self-signed \
  --invite-code <desktop-invite-code> \
  --expected-guests 1 \
  --label real-two-device-lan
```

Summarize a completed bundle:

```sh
node scripts/lan/summarizeSmokeArtifacts.mjs <artifact-dir>
```

Smoke output defaults to `.artifacts/lan-smoke` and should remain outside
`.context`.

## Record

```text
Date/time:
Host OS:
Guest device/browser:
Companion URL:
ROM:
Host result:
Guest result:
Guest disconnect result:
P2 input result:
P3/P4 state:
Certificate UX notes:
Artifact path:
Overall:
```
