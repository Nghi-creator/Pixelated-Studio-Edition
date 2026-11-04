# Fixed-grid engineering capacity fixture

This default-off mode characterizes the disposable Frozen-Bubble/Linux source.
It creates no cause labels or accepted diagnostic groups. The fixed grid is
`[0, 30000, 32000, 34000, 36000, 37500, 40000, 50000]` microseconds.

After building the engine, use `pairedObservation.mjs prepare-capacity` with the
same explicit `--image`, `--acquisition-id`, `--core-revision` and `--output`
arguments as the paired fixture, plus `--grid-index` (one digit 0–7). The plan fixes
one dose and one acquisition. It does not accept arbitrary delay values. Allocate
all eight plans and their order before data. Execute with the existing `acquire`
command and exclusive output directory. Preserve failed prefixes and unstarted
suffixes; never repeat an attempt lease or replace a failed slot.

Calibration has its own plan/mode/receipt identities. It retains original
30→24→30 FPS control, five-second action, 20% limit, fault watchdog and container
budgets. At index zero the owned element is still explicitly started and stopped;
a capacity-only `started` acknowledgement distinguishes a zero-delay start from
its preimage. All phases require held-property/generation support and verified
cleanup. An unmet descriptive screen is separate from an acquisition failure.

Healthy and post-reference rows, as well as measured native phases, must contain
complete generation-bound `native-counter-read-brackets-v1` evidence. These are
worker snapshot read calls, not media capture times or clock alignment. The
source-bound producer inspector checks controller/rollback/property/reference/
cleanup integrity. A separate core method computes exact guarded capacity windows
and selects the lower median qualifying point from the complete grid, using only
healthy, initial and post references. Relief does not select the dose.

If that complete selection has a candidate, `prepare-capacity-confirmation` takes
`--selection /absolute/private/selection.json` instead of `--grid-index`. It checks
the full eight-row declaration and deterministic lower-median rule, binds source,
image, both revisions and original selection bytes, and copies those bytes beside
the new plan. Acquisition rechecks that copy. Declare exactly one fresh confirmation
in the protocol; failure ends it. A selection file is a declaration, not an
authenticated authority. Independently verify original calibration files/source
custody and recompute the selection before preparation.

Exports share one fixed-grid protocol context across doses and confirmation; the
actual active dose stays in raw plan/property evidence. This avoids using the
active cause/dose as a classifier input. Each acquisition's three phases remain
one source group. Original fixed 50,000 and 37,500 microsecond modes remain separate.
New contrast plans also require worker brackets on their healthy/post references;
legacy inspection remains available without fabricating missing timing fields.

A confirmation reports native point contrast and requires separate guarded-window
and independent N3 checks. No finite-window result supplies transferable processing
bounds, untouched evaluation, empirical acceptance or production authority.
