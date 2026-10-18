# N5 synthetic release reproduction

[Export](n5-experiment-export.md), [handoff](n5-scenario-harness.md).

From this trusted producer checkout, create an existing disposable directory:

```sh
mkdir -p /private/tmp/n5-reproduction
python3 scripts/n5/exportSyntheticExperiments.py /private/tmp/n5-reproduction
```

The silent command publishes eight private gzip USTARs using actual fresh host
collectors and production export, with fixed synthetic integer execution inputs:
healthy, host, inclusive boundary, failed pressure, cancelled partial run,
unsupported runtime, missing traces and unknown cleanup timing. It does not run
ScenarioRunner, GI, a workload, workers, pressure, networking or real capture.
Its version/commit declarations and engineering assignments are synthetic;
export-local aliases do not prove independent source runs.

From the sibling core checkout:

```sh
.venv/bin/python -m tests.scenarios.check_reproduction \
  --producer-bundles /private/tmp/n5-reproduction
```

Core release 1.0.0 independently authors eight cases (80 JSON files, 280,156 bytes)
from the frozen arithmetic and explicit N4 boundary/capability expectations. Its
read-only checker pins all fixture bytes, checks separate effect/cleanup expectations,
compares every decompressed producer member byte, adopts/inspects each bundle and
verifies canonical API/CLI result parity. Expected files never enter a bundle.
There is no pin-refresh mode. Previous P0/N1/N2/N3/N4 releases remain unchanged.

`test_scenario_reproduction.py` separately pins each case's content digest: SHA-256
of the compact sorted JSON map of member name to raw member SHA-256. It exercises
actual export, repeated-export determinism, silent CLI/private output and fixed
failure. Gzip hashes are excluded because header bytes vary by Python version.
The existing Node scenario wrapper discovers these tests in configured engine CI;
core CI adds read-only reproduction on its 3.13 and minimum 3.11 jobs. This records
configuration, not observed hosted or actual minimum-version execution.

Trace sampling 1/1000 with bounds of 2 frames/10 events keeps fixtures compact.
This sample does not meet real tracing coverage/overhead criteria. Raw phase
counters retain every second interval, while N4 event clocks stay separate.
Use the [live procedure](n5-live-test-procedure.md) for actual measurements.
