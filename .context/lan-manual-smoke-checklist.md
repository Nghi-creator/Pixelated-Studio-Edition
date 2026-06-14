# LAN Multiplayer Manual Smoke Checklist

Last updated: 2026-06-09

Use this checklist for the real two-device LAN validation. The harness now
automates companion preflight, invite redemption, companion-authenticated guest
join, peer-count changes, and disconnect cleanup. Accepting the self-signed
certificate remains the only unavoidable protocol setup step; visual
playback/input quality still needs human confirmation.

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
   - QR code for the same HTTPS companion join URL.
   - Short-lived invite code.
   - Host-local pairing token with copy warning.
   - LAN warning/checklist copy explaining that the guest page runs join checks.
5. Open the host player and start a game.
6. Confirm host stream reaches `LIVE STREAM ACTIVE`.
7. Toggle stream telemetry on.
8. After the guest joins, press `Copy Stats` in Stream Stats. During an active
   smoke run the button shows `Saved` and writes the host JSON directly into
   the bundle.
10. Press Regenerate in the desktop LAN panel and confirm the code/status updates without stopping the engine.
11. Press Revoke and confirm the status says the invite is revoked while the engine remains active.
12. Press Regenerate again before any additional guest join attempt.

## Guest Steps

1. Scan the desktop QR code to open the HTTPS companion join URL. Use the copyable URL as fallback.
2. Confirm the guest page shows the three LAN join checks:
   - `Certificate: Accepted for this join page.`
   - `Invite: Active` with its expiry time.
   - `Host engine: Available.`
3. If Certificate says trust is required, use the provided link, accept the local/self-signed certificate warning, return to the join page, and press `Check again`.
4. Enter the invite code shown by the desktop app. Join remains disabled until all three checks pass.
5. Join the invite/session as spectator first.
6. Confirm guest stream reaches `LIVE STREAM ACTIVE`.
7. Toggle stream telemetry on.
8. Press `Copy Stats` in Stream Stats. Confirm the button shows `Saved`; the
   guest JSON is written directly into the host's active smoke bundle.
9. Request P2, send a few inputs, then release the slot.
10. Close the guest tab.

## Expected Results

- Guest can load the companion page over HTTPS.
- Guest sees explicit certificate, invite lifecycle, and host engine preflight states before Join.
- Join stays disabled for an expired/revoked invite or unavailable host engine.
- Desktop QR opens the same displayed HTTPS companion join URL on the guest device.
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
Fill out `manual-smoke-notes.md` in that bundle while the run is fresh. The
harness captures Stream Stats JSON directly into:

- `host-stream-telemetry.json`
- `guest-stream-telemetry.json`

The bundle should contain:

- `engine-smoke-report.json`: pass/fail report, phase summaries, artifact paths.
- `engine-health-events.ndjson`: every `/health` poll during baseline, join, and disconnect waits.
- `manual-smoke-notes.md`: pass/fail checklist and human observations.
- `host-stream-telemetry.json`: saved when the host presses Stream Stats > Copy Stats.
- `guest-stream-telemetry.json`: saved when the guest presses Stream Stats > Copy Stats.

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

Engine smoke artifact path:
```

## Harness Command

Run this from the repo after the host stream is already active and before the guest joins:

```sh
node scripts/lan/multiplayerSmoke.mjs --engine-url https://<host-lan-ip>:8090 --allow-self-signed --invite-code <desktop-invite-code> --expected-guests 1 --label real-two-device-lan
```

The harness prints the artifact directory as soon as it starts. It verifies
`/invite/preflight`, redeems the short-lived invite, joins the active lobby as a
spectator through the companion credential, sends a peer-targeted WebRTC offer,
verifies the camera peer count increases, then disconnects the automated guest
and verifies cleanup. It also waits for the active host/guest browser Stream
Stats capture and writes both JSON snapshots into the bundle.

Console output is phase-oriented: each completed assertion prints `[PASS]`, a
required human/browser action prints `[WAIT]`, and the first failed assertion
prints `[FAIL]` plus the artifact report path.

Summarize the completed bundle into one review verdict:

```sh
node scripts/lan/summarizeSmokeArtifacts.mjs .context/smoke-artifacts/<run-id>
```

This writes `smoke-verdict.md` into the bundle, prints the same markdown, and
exits nonzero for a FAIL verdict. The verdict requires all five source
artifacts, session survival, peer join/disconnect transitions, healthy host and
guest WebRTC telemetry, and completed manual notes with `Overall: PASS`.

If completed notes are already saved elsewhere before a run, start the harness
with:

```sh
node scripts/lan/multiplayerSmoke.mjs --engine-url https://<host-lan-ip>:8090 --allow-self-signed --invite-code <desktop-invite-code> --expected-guests 1 --label real-two-device-lan --notes /path/to/completed-notes.md
```

## Failure Notes

- Certificate remains `Trust required` after following the provided link: record the guest browser/OS and certificate warning text; consider local CA packaging or a tunnel strategy.
- Harness fails before `Companion preflight: PASS`: accept the certificate in a browser, confirm the desktop invite is active, then rerun with `--allow-self-signed --invite-code <code>`.
- Invite shows `Expired` or `Revoked`: regenerate it in the desktop LAN panel, then press `Check again`.
- Host engine shows `Unavailable`: initialize or restart the host engine, then press `Check again`.
- All checks pass but redemption fails: record the response from `POST /invite/redeem`; this is no longer expected invite/certificate/engine troubleshooting.
- Hosted Vercel direct-to-LAN HTTP fails: expected in Chrome; use the HTTPS companion instead.
- P3/P4 disabled: expected on Docker Desktop setups without `/dev/uinput`; validate P3/P4 later on a Linux host with uinput access.
