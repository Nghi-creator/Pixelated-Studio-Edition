# N5 software closeout and pending live acceptance

**Recorded:** 2026-10-12. **Outcome:** local software delivered; real runtime acceptance open.
[Handoff](n5-scenario-harness.md), [reproduction](n5-experiment-reproduction.md).

Steps 1–7 deliver bounded lifecycle/recording control, concrete healthy/owned CPU
adapters, fixed measured-effect predicates, sanitized export and independent
fixture reproduction with detached core inspection. The core's
`docs/scenarios/N5_SOFTWARE_CLOSEOUT.md` records separate software/runtime/hosted
outcomes; `docs/scenarios/N5_RUNTIME_ACCEPTANCE.md` is the live acceptance ledger.

The Step 7 full local gates pass: 716 Node tests, 109 nested Python tests,
workspace lint/lockfiles, engine build, API typecheck and production web build.
The existing external-artifact engine skip and Linux-only idle-child skip remain.
Eight synthetic production exports match independently authored core fixture bytes
and API/CLI results. Earlier release bytes and dependencies are unchanged. These
are the recorded Step 7 runs, not newly repeated suite claims for documentation.

At closeout the actual Linux camera adapter preflight on this Darwin host returned
`unavailable / runtime_unavailable`, with no runtime fields, acquired resources or
prepared plan. No live camera, workload or CPU worker was started. Docker is absent
from PATH and no Linux connection or N5 real campaign evidence was supplied. A
local GStreamer version probe failed to finish during macOS service initialization;
it does not establish a working capture path. Installed Node 26.4.0/Python 3.14.4
are not actual minimum-version evidence.

Real execution needs an actual Linux/Xvfb :99/PulseAudio auto_null.monitor,
1280×720/30 VP8 peer and draining receiver, exact commits/versions/allocation,
predeclared workload/seed/order/assignments and distinct independent source runs.
Use trusted in-process runtime hooks and the frozen export contract; this library
is not a remote provisioner or standalone workload launcher. Retain all raw,
failed/unavailable and cleanup outcomes, export after frozen recording and cleanup,
and verify each bundle in the detached core.

V1 approves only healthy and host contention. Phase 1.3 needs two real fault classes;
healthy is not a fault class. A second adapter and its observable effect/restoration
criteria require additive approval/implementation before trials. All inherited N4
capture/correlation/coverage cases, five paired overhead trials, browser and actual
minimum-version/container/hosted execution remain unverified. Synthetic sparse
fixture traces and hashes do not close these gates or prove held-out independence.

Software closeout is recorded. Step 8 real acceptance and Phase 1 remain open.
The active plan/progress are archived only on the subsequent slice transition;
no automatic N6 transition or runtime success is claimed.

The initial closeout covered Step 1–7 library delivery. The subsequent
[live workflow extension](n5-live-test-procedure.md) implements campaign entry,
second-adapter pacing, assignments and automated overhead tools; its tests are
recorded in the current handoff. Both fault classes still need real validation.
