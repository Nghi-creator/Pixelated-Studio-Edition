# N5 scenario harness

The opt-in scenario harness runs predeclared perturbation experiments in the
Pixelated engine and exports evidence for detached inspection by
`latency_fingerprinting`. Normal startup leaves these controls disabled.

The [lifecycle runner](n5-lifecycle.md) uses six phases, monotonic deadlines,
fresh measured-phase recordings and a single-owner private lease/journal.
Exact resource generations and restoration outcomes remain visible. Runtime hooks
are trusted cooperative code and must obey bounded waits and cancellation.

[Supported adapters](n5-adapters.md) provide draining-peer camera hooks, Linux
allocation preflight, owned CPU workers and fixed effect predicates. Healthy and
host-contention use frozen experiment-v1 roots; capture pacing uses additive v2
roots. Workload, seed and Node version are explicit owner declarations. The harness
cannot infer scene contents or establish scientific source independence.

[Bundle export](n5-experiment-export.md) freezes phase artifacts and hashes without
importing the research core. Detached core inspection validates artifacts and
recomputes effects. [Synthetic reproduction](n5-experiment-reproduction.md) checks
producer/core compatibility; real timing and overhead require measurements.

Use the [live procedure](n5-live-test-procedure.md) for opt-in desktop/container
configuration, frozen campaigns, cancellation, recovery and paired overhead trials.
[Stage tracing](n4-stage-trace-export.md) supplies independent host/browser timing
with explicit clock domains, exclusions and collection limits.
