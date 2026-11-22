# Interim contained-fixture qualification and evaluation

The receiver-acknowledged source completed a same-session study on 22 November
2026: **36 acquisitions, 18 calibration cases, then 18 held-out cases**. All six
calibration folds passed. Evaluation returned **15 correct, 3 abstentions and
0 incorrect predictions**. The three abstentions were all no-injected-fault cases;
owned identity delay and CPU pressure each returned six correct predictions.

The canonical sanitized bundle lives in the [latency_fingerprinting repository](https://github.com/Nghi-creator/latency_fingerprinting)
at `experiments/n11/receiver-ack-baseline-v1/`. It includes all query outcomes,
protocol/calibration summaries, source and fitting identities, a compact history
of directly relevant negative/incomplete results, and a standalone public verifier.
The data is maintained there once; this page documents the producer's role.

## What the producer demonstrated

The recorded raw/export pipeline completed all 36 acquisitions with 108 phase
comparisons and 36 verified restorations. All 3,952 receiver reports were forwarded;
none were rejected. The immediate post-collection container check was empty.
The fit and all 18 prediction bytes reproduced in private raw replay. This source
used one in-flight receiver report, a 250 ms relay-receipt bound and a 200 ms poll
after acknowledgment; the relay's 100 ms arrival gate and native health/action
bounds remained in force. Binding revocation is an explicit failure, not a normal
cleanup acknowledgment.

The recorded source manifest was
`sha256:45a2334e0ccc12c956f9321bbd25f2744f6efa0c371981f76e712d9243867784`.
The recorded producer revision was `4d20742af5fe5a3b36bf9e9904d8324554e0be5c`;
the source manifest and private frozen files identify the actual recorded bytes.
Later folder restructuring does not requalify the current checkout automatically.

## Limits and retained outcomes

Two no-fault queries exceeded their fitted radius. A third lacked an eligible
encoded response because its identity prefix could not be reconciled. The raw
acquisition completed, but that candidate-projection gate stayed closed. No query
was replaced and no radius was retuned. Full raw telemetry, machine-specific
identities and logs remain private; the public verifier checks published ledger
and checksum consistency, not the original raw measurements or scientific labels.

This is one correlated host session, with no established independent support
groups. Owned identity delay is not physical capture latency. Later-session
transfer, physical mixed/changing faults, real-fault diagnosis, comparisons and
probe utility remain open. Earlier incomplete transfer and acquisition cohorts
stay retained under their original source versions; they are not pooled with
this result or erased by the completed run.

See [the N10 runtime guides](../../n10/README.md), [resource evidence contract](../resource-observation.md)
and [research script layout](../../../../engine/runtime/scripts/research/README.md)
for reusable behavior and procedures.
