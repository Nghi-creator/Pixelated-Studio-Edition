# LAN Multiplayer Manual Smoke Checklist

Last updated: 2026-06-04

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
8. When the harness prints the bundle path, keep that folder open.
9. Copy the host telemetry JSON after the guest joins and paste it into `host-stream-telemetry.json` in the bundle.
10. Press Regenerate in the desktop LAN panel and confirm the code/status updates without stopping the engine.
11. Press Revoke and confirm the status says the invite is revoked while the engine remains active.
12. Press Regenerate again before any additional guest join attempt.

## Guest Steps

1. Open the HTTPS companion join URL from the host.
2. Accept the local/self-signed certificate warning if shown.
3. Enter the invite code shown by the desktop app.
4. Join the invite/session as spectator first.
5. Confirm guest stream reaches `LIVE STREAM ACTIVE`.
6. Toggle stream telemetry on.
7. Copy the guest telemetry JSON and paste it into `guest-stream-telemetry.json` in the bundle.
8. Request P2, send a few inputs, then release the slot.
9. Close the guest tab.

## Expected Results

- Guest can load the companion page over HTTPS.
- Guest can redeem the invite code without seeing the raw host pairing token.
- Host can regenerate and revoke invite codes without restarting the engine.
- A revoked invite code cannot be redeemed; a regenerated code can be redeemed.
- Host stream stays active when guest joins.
- Guest receives video/audio from the same running session.
- Closing the guest tab does not stop the host stream.
- Engine peer count increases when guest joins and returns to baseline after guest disconnects.
- P1/P2 inputs remain slot-authorized.
- If `/dev/uinput` is unavailable, P3/P4 stay disabled with a clear message.

## Record Results

The harness creates one timestamped bundle under `.context/smoke-artifacts/`.
Fill out `manual-smoke-notes.md` in that bundle while the run is fresh. Keep the
copied Stream Stats JSON in:

- `host-stream-telemetry.json`
- `guest-stream-telemetry.json`

The bundle should contain:

- `engine-smoke-report.json`: pass/fail report, phase summaries, artifact paths.
- `engine-health-events.ndjson`: every `/health` poll during baseline, join, and disconnect waits.
- `manual-smoke-notes.md`: pass/fail checklist and human observations.
- `host-stream-telemetry.json`: host player Stream Stats > Copy Stats JSON.
- `guest-stream-telemetry.json`: guest player Stream Stats > Copy Stats JSON.

Manual notes fields:

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

The harness prints `Bundle: .context/smoke-artifacts/<run-id>` as soon as it
starts. Paste host/guest Stream Stats JSON into the two telemetry files in that
folder. Close the guest tab when the harness prints that join was validated. The
harness should then pass after peer count returns to baseline.

If telemetry JSON or notes are already saved elsewhere before a run, start the
harness with:

```sh
node scripts/multiplayerSmoke.mjs --engine-url https://<host-lan-ip>:8090 --allow-self-signed --expected-guests 1 --label real-two-device-lan --host-telemetry /path/to/host.json --guest-telemetry /path/to/guest.json --notes /path/to/completed-notes.md
```

## Failure Notes

- Certificate page is too scary/confusing: consider local CA packaging or a tunnel strategy.
- Companion loads but invite redemption fails: check whether the invite code expired or was revoked, confirm LAN mode, and verify the companion can proxy `/health`.
- Pairing says the HTTPS join page cannot be reached: open the companion URL directly and accept the local certificate warning, then retry pairing.
- Pairing says the join page cannot reach the local engine: keep the desktop app open, initialize the engine, and retry after `/health` is ready.
- Hosted Vercel direct-to-LAN HTTP fails: expected in Chrome; use the HTTPS companion instead.
- P3/P4 disabled: expected on Docker Desktop setups without `/dev/uinput`; validate P3/P4 later on a Linux host with uinput access.
