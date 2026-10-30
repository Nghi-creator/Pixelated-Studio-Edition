# Contained game-capture controller experiment

This opt-in experiment applies the dedicated-worker cadence controller to a
privately owned Frozen-Bubble/X99/Pulse scene through the actual camera,
authenticated relay, local owner and Chromium receivers. The source label is
`isolated_game`. Normal production sources still reject controller configuration
and dispatch; the standard worker option does not activate this experiment.

```sh
npm run build:engine
npm run smoke:n10-browser-native -w @pixelated/engine-runtime -- \
  --image "$N10_NATIVE_IMAGE" --mode engineering-game-disturbance
```

Use an immutable cached image ID from the
[browser/native acceptance procedure](n10-browser-native-acceptance.md). Keep the
emitted JSON in a new ignored `local/` file and inspect it with:

```sh
PYTHONPATH=engine/runtime python3 -m live_probe_control.game_control_disturbance_screen \
  "$N10_GAME_CONTROL_RECEIPT"
```

The method is `n10-contained-game-control-disturbance-v1`; the role is
`contained_game_control_disturbance_not_qualification`. The temporal measurement
protocol, fixed windows, bounded five-second 30→24→30 action, sibling 30 FPS,
continuous transition-gap checks, balanced 1500 kbps profile and durable
restoration/budget checks are the same as the
[integrated synthetic screen](n10-control-disturbance.md). The game must remain
active and its scripted inputs advance in each native measurement window.
CPU/RSS remain descriptive; no relief benefit or perceptual threshold is inferred.

## Capture ownership

Only a real, live `GameScene` with its private X99 display can create the host's
capture context. It retains exact owner/game/display PID and start identities
and the UID-owned X11 socket's device/inode. Scene children must belong to that
owner. Configuration binds this descriptor to the existing owner/session journal
and policy. A game descriptor cannot accompany a synthetic or production source,
and an isolated-game bootstrap cannot omit it.

The dedicated child checks that the claimed owner is its actual parent, pins all
three lifetimes with Linux pidfds, verifies identity before/after opening each
pin and checks the socket before putting capture into READY. These descriptors
observe liveness only. The watchdog still targets the exact dedicated media
worker; it never signals the game, display or camera host.

The control thread checks pidfd liveness with nonblocking polls and periodically
checks socket identity at most four times per second, with additional fresh
checks at bootstrap and setters. No per-frame Python/filesystem callback is
introduced. Process death, socket replacement, wrong parent/UID or a reversed
clock invalidates capture. The binding cannot revive after invalidation. Source
loss blocks a new setter; loss after mutation can leave unknown restoration and
a dirty journal, followed by exact-worker watchdog teardown. Continue to retain
that failure instead of treating process death as restoration proof.

This is contained engineering acquisition, not a production release or a
qualified live family. A met temporal screen does not establish perceptual or
audio quality, desktop playability, general resource benefit or held-out
diagnostic value. Those require separate predeclared acceptance. Live authority
remains false, and no browser/network message grants controller permission.


The separate [contained failure cohort](n10-contained-game-failures.md) covers
cancellation, observation/source loss, active reconnect, replacement and local
owner restart against the same budget ledger. Its expected dirty/unknown outcomes
are distinct from this completed-action temporal screen.

The separate [fixed-schedule unchanged/action acquisition](n10-action-cost.md)
provides common phase timing and an unchanged condition for developing a matched
cost comparison. It retains a distinct method and operator-only evidence role.
