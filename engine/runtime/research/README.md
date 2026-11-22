# Latency-fingerprinting research runtime

These opt-in modules support trace collection, bounded experiments and offline
qualification. Gameplay entry points remain in the runtime root. Moving these
modules does not enable probes or change the current qualification scope.

| Directory | Responsibility |
| --- | --- |
| `tracing/` | Camera stage trace configuration, hooks, recording and export |
| `trials/` | Explicit disposable capability, bitrate and cadence trials |
| `resource_observation/` | Candidate independent private-cgroup CPU reads and opt-in condition observer seam |
| `scenario_harness/` | Bounded N5 workloads, campaign lifecycle and evidence export |
| `live_probe_control/control/` | Contracts, cadence controller, ownership/binding, transport, journal and watchdog |
| `live_probe_control/peers/` | Camera workers, peer protocol/supervision/lifetime and receiver bridge |
| `live_probe_control/capture/` | Owned game capture and dedicated WebRTC/browser workers |
| `live_probe_control/qualification/` | Observation, continuity, resource/fault screens and qualification protocols |

`private_journal.py` supplies shared private journal I/O to N5 and live probes.
The `research.live_probe_control` package still exports its lifecycle controller
and contract types. Other modules use their owning subpackages directly.

Run Python modules from `engine/runtime`, for example:

```sh
python3 -m research.trials.live_probe_inventory
python3 -m research.trials.live_probe_cadence_trial --isolated-cadence-trial
```

The second command is an explicit disposable media experiment and requires the
native Linux/GStreamer dependencies. See the
[cadence procedure](../../../docs/research/n10/experiments/n10-cadence-feasibility.md) for its full setup.
Research drivers are grouped in [`scripts/research/`](../scripts/research/README.md).
Root-level [`scripts/research/n4/`](../../../scripts/research/n4/) and
[`scripts/research/n5/`](../../../scripts/research/n5/) supply synthetic fixture
exporters for the Python core.

Both runtime images copy this entire package. The native acquisition driver
recursively hashes its Python sources and its own harness sources. The frozen
game-browser v1 driver retains logical source identifiers and maps them to the
current files in its isolated worker dependency closure. Those identifiers are
wire bindings, not filesystem paths. Reorganizing files changes the source
context and does not requalify historical evidence.

The [resource observation contract](../../../docs/research/n11/resource-observation.md)
describes its separate controller clock, bounded reads and pending launcher/
inspection integration. It does not enable a fixture acquisition.

For an isolated-game worker with `N11_RECEIVER_DELIVERY_DIAGNOSTICS=1`, the
cadence operation checkpoint also retains `admission_progress` using
`n11-native-admission-progress-trace-v2` (the reader also accepts archived v1).
It brackets the existing native reads
during fresh-source admission and records previous/current capture and encoder
counts, each counter's last observed advance, their oldest timestamp, and health decisions. Its timestamps
are worker-local monotonic values; do not subtract controller or browser times.
The last 32 completed reads are retained with a total and explicit truncation
flag. A getter that throws does not produce a completed-read row.

This opt-in trace adds no native reads, retries, admission time or control
authority. It stops before journal/controller execution; ordinary workers do
not collect it. The 150 ms admission budget and 750 ms health lease remain in
force. Trace collection adds clock reads and serialization overhead, so its
source version must be qualified separately from earlier frozen evidence.

Native health requires capture and encoded counts each to have advanced within
the unchanged 750 ms lease. They may advance on different reads; advancing only
one counter never establishes health. Any counter regression remains invalid for
the port's lifetime. Admission rechecks its original deadline after each native
read, so a slow healthy getter cannot authorize journal/controller execution
after the 150 ms budget or request expiry. An in-flight getter is not preempted;
this check prevents late admission rather than bounding getter execution time.
