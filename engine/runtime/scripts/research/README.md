# Research launchers and acquisition tools

These tools are explicit research entry points. Python modules use the
`engine/runtime` package root; invoke them from that directory with `python -m`
or use the documented launcher. Package scripts resolve the current locations.

| Directory | Responsibility |
| --- | --- |
| `n10/browser/` | Native browser acceptance host/relay, receiver page and quality/continuity checks |
| `n10/capture/` | Isolated game-browser capture trial and receiver |
| `n10/cost/` | Action/fault cohorts, process/container/browser costs and fault lifetimes |
| `n10/lifecycle/` | Browser/relay shutdown, camera-death supervision and fault-mode helpers |
| `n10/observers/` | Native sampling, moving/static observer checks and base control disturbance |
| `n10/shared/` | Recursive source custody inventory and atomic completion markers |
| `n11/acquisition/` | Raw, paired, condition and resource-condition acquisition entry points |
| `n11/browser/` | Raw/paired browser sampling assets and telemetry bridge |
| `n11/native/` | Contained Python paired, pacing, pressure and condition observers |
| `n11/protocols/` | Owned condition/resource declarations and pacing variants |
| `n11/receipts/` | Source/phase/resource inspection, receipt arithmetic and synthetic receipt fixtures |
| `n11/export/` | Source-bound raw observation export |
| `n11/studies/` | Allocation, repeated-block study runners and pipeline qualification |

JavaScript tests live beside their corresponding tools and fixtures, including
N11 tests previously mixed into N10. `npm test` discovers both nested trees.
Python regression tests remain in `tests/python/qualification/` and
`tests/python/live_probes/`. The source inventory includes both script trees,
including native Python helpers copied into the contained runtime.

Frozen game-browser wire source identifiers retain their original logical names;
`n10/shared/researchSources.mjs` maps them to physical files. Reorganizing files
changes source hashes and does not rewrite or requalify frozen experiment evidence.
For session procedures see [studies](n11/studies/STUDY_SESSION.md) and
[within-session studies](n11/studies/WITHIN_SESSION.md).
