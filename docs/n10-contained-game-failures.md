# Contained game failure cohort

This fixed engineering cohort exercises the
[owned game-capture boundary](n10-contained-game-control.md) through actual
camera/worker/local-owner/browser paths. It does not qualify production dispatch,
perceptual/audio quality, desktop playability or diagnostic value.

Build the engine and select an immutable already-cached native image. Use a new
absolute output path in ignored `local/`:

```sh
npm run build:engine
node engine/runtime/scripts/n10/gameFailureCohort.mjs \
  --image "$N10_NATIVE_IMAGE" --output "$N10_GAME_FAILURE_OUTPUT"
PYTHONPATH=engine/runtime python3 -m live_probe_control.game_failure_screen \
  "$N10_GAME_FAILURE_OUTPUT"
```

The order is complete action, cancellation, receiver-observation loss, source
socket-identity loss and reconnect during an action. Every case uses fresh owned
game/display, camera, worker generations, browser, credentials and private ledger.
The complete-action case retains its five-second temporal protocol. Fault cases
use one two-second 30→24 FPS request, after fresh native/receiver admission and a
fixed three-second warmup. A fault is injected only after the actual native target
is observed. The usual 26-second scenario, 42-second container and owned cleanup
bounds apply. Cases are retained in order without retries or replacement; output
is exclusive and checkpointed after each case. Unknown container/browser/assets
cleanup stops acquisition.

| Case | Expected action/restoration | Journal | Old worker |
| --- | --- | --- | --- |
| Complete | Completed; independently verified restoration | Clean; one action, seven seconds reserved | Normal contained shutdown |
| Cancel | Aborted/cancelled; independently verified restoration | Clean; one action, four seconds reserved | Graceful disconnect and reap, exit 0 |
| Receiver loss | Unknown restoration, or no received result | Dirty; one action, four seconds reserved | Exact-worker teardown, SIGKILL |
| Source identity loss | Explicit unknown restoration | Dirty; one action, four seconds reserved | Exact-worker teardown, SIGKILL |
| Active reconnect | Unknown restoration, or no received result | Dirty; one action, four seconds reserved | Exact-worker teardown, SIGKILL |

Cancellation uses the issued local owner handle while browser observations remain
active. Receiver loss stops the real first-viewer collector while checking that
video still advances. Planned reconnect uses the actual browser peer-disconnect
and new-offer path. Fault requests originate only from directly owned CLI output
into the disposable relay; no incoming network handler authorizes fault injection.

The source fault first validates the exact owned scene/socket, moves only that
socket entry to a unique backup, and binds a disposable replacement at X99. It
restores the exact original socket on the first host tick after a 500 ms hold,
or on an earlier action result, before replacement admission. Existing X connections remain alive. Cleanup
checks inode/device before unlinking and refuses to overwrite unexpected state.
Game/display processes are never fault kill targets; the captured media worker's
sticky invalidation and dirty intent remain even after the path is restored.

Each fault case requires a fresh replacement worker and live receiver admission,
rejection of the old draft/receiver, and unchanged sibling identity with advancing
source/game counters. It then closes the local owner and creates a new owner at
the same ledger. Both current receivers receive new challenges and warm up from
future authenticated observations, without replaying buffered samples. The new
owner must reject the old capability and retain the full reservation. Dirty
cases must reject a new request specifically because of dirty intent; clean
cancellation may prepare a read-only draft without reserving another action.
A fixed 2.5-second post-restart interval checks continued readiness.

A two-second sibling browser window spans the fault. It uses the existing 30 FPS,
640×480, no-drop/freeze, nonblank/variable picture and 250 ms presentation/media-gap
screen. Missing data stays unavailable; process death is never restoration proof.

The offline method is `n10-contained-game-failure-v1`. All five cases must have one
image/software/browser context and meet their declared outcomes. Later cases are
still assessed after an unavailable row. `failure_screen=met` means only this
contained failure-handling screen; qualification remains unavailable, perceptual
quality unevaluated and live authority false. A no-result case is reported as
`unavailable_no_result`, never converted into a successful or verified result.
