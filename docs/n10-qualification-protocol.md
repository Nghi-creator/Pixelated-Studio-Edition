# Qualification protocol declarations

`live_probe_control.qualification_protocol_v2` checks an operator's proposed
qualification protocol without running an acquisition, inspecting evidence,
approving review claims or enabling a controller. It is separate from frozen
core evidence roots, engineering controller configuration and producer activation.

Generate a new draft under ignored `local/` from the repository root:

```sh
PYTHONPATH=engine/runtime python3 - <<'PY'
import json
from pathlib import Path
from live_probe_control.qualification_protocol_v2 import draft
Path('local').mkdir(exist_ok=True)
with Path('local/n10-qualification-draft.json').open('x') as output:
    output.write(json.dumps(draft(), indent=2) + '\n')
PY
PYTHONPATH=engine/runtime python3 -m live_probe_control.qualification_protocol_v2 \
  local/n10-qualification-draft.json
```

The version is `n10-qualification-protocol-draft-v2`, role
`operator_planning_only`, with `live_authority=false`. Input is bounded to64KiB,
closed fields and procedure versions, duplicate-safe JSON and finite typed values.
The checker reads only the supplied protocol file; nested references are text
and are not opened or executed. Inspection does not modify the draft.

## Required declarations

| Group | Required content |
| --- | --- |
| Context | Exact image, final source hash and browser; the initial supported proposal is an owned Linux/aarch64 game capture with a Darwin/arm64 headless receiver, balanced1500kbps,640×480, VP8 CPU-used6/quantizer48. Other contexts require a separate protocol revision. |
| Operation | Baseline/target cadence, duration and bounded controller policy. The fixed30→24 FPS/five-second proposal and its budgets come from engineering limits; generation does not qualify them. A different rate/duration requires separate procedure versions. The full reservation must fit the cumulative budget; the typed engineering envelope still applies. |
| Fault operation | Separate fixed 30→24 FPS/two-second request and four-second reservation, including its actual two-second maximum-duration policy. This declaration cannot be substituted with the five-second matched-action operation or changed by an integral-looking float or Boolean. |
| Cost limits | Explicit maximum, units, comparison, interval, rationale and review reference for all 14 fixed metric slots. Six action CPU/RSS slots use action-minus-unchanged pairs; eight fault slots use absolute CPU-seconds. Seven fault intervals end at cleanup callbacks; whole-camera death ends after owned descendant cleanup. Limits remain null until decided. |
| Quality | Procedures, criteria and review references for cadence, perceptual quality, audio and supported desktop workflows. A procedure must explicitly state any scope exclusion; headless video proxies do not establish desktop/audio acceptance. |
| Additional faults | Separate scope decisions for controller-thread exit, controller-thread blocking and whole-camera death. Each required case must name its exact versioned procedure; an exclusion needs rationale and review reference. One thread case cannot stand in for the other. |
| Unmeasured scopes | Decide whether initial source startup, later process/container/browser exit, individual ancillary breakdown and browser cleanup/RSS/GPU costs are accepted exclusions or must be measured. Whole-camera death has an additional explicit later relay/monitor/interpreter/container/browser-exit declaration. A measurement requirement needs its own procedure; acceptance needs a scoped rationale and review reference. |
| Review and acquisition | Protocol revision, review reference, independence rationale and fixed prospective retention rules. These are supplied declarations, not authenticated approvals. |

The fixed procedure inventory covers read-only observer comparison, matched
full-span action costs, actual cancellation/loss/reconnect costs, stopped-worker
costs, both controller-thread cases, whole-camera death and Linux native guard
regressions. Changing a procedure's meaning or version
requires a new protocol revision rather than silently substituting another screen.
Cost scopes overlap or use independent clocks; the protocol cannot authorize
adding them into a synchronized system total.

## Results and the qualification sequence

`invalid` means a declaration violates the closed contract. `draft_incomplete`
retains every missing decision by field path. `complete_declarations_unverified`
means the declared fields are complete and structurally consistent. Exit0 means
only this last state; incomplete or invalid inputs exit1. All states retain
`review_verified=false`, `qualification=unavailable_protocol_is_not_evidence` and
`activation=not_implemented_by_this_tool`. A review-reference string is not proof
of review, and no result is a dispatch capability or approved policy.

Use the protocol in this order:

1. Decide supported scope, cost/quality limits, required faults and exclusions;
   justify limits independently of development receipt distributions.
2. Review those decisions and the actual measurement coverage. Complete and check
   the declarations. A complete file still needs external review and a final
   source/context freeze before qualification acquisition.
3. Freeze independent qualifying cases, exact context, criteria and output paths.
   Retain all original attempts; no retries, substitution, averaging away failures
   or hidden alignment of browser/native clocks. Historical sources need explicit
   applicability review and cannot be renamed into the frozen context.
4. Assess new observations and supported workflow acceptance against that protocol,
   retaining unavailable and failed gates. Bind an accepted decision and limits to
   an explicit capability/policy revision before implementing supported activation.

The current checker performs none of steps2–4's review, acquisition, evidence
acceptance or activation. Normal production sources retain their engineering
control guard. N9 proposals, old record hashes, a caller's filled JSON or this
checker's exit status cannot authorize mutation. The core
[qualification requirements](../../latency_fingerprinting/docs/live_probes/N10_QUALIFICATION.md)
state the broader evidence and producer boundary.

## Version compatibility and migration

`live_probe_control.qualification_protocol` remains the v1 generator and checker.
Its 11 cost slots, procedure inventory, combined controller-thread scope field,
document hashes and interpretation are preserved. Each checker accepts only its
own format; changing a method string cannot convert a protocol.

For a new v2 draft, retain the original v1 file. Copy only unchanged context,
matched-action operation, quality declarations, original cost rows and original
exclusion rows after checking their applicability. The whole-camera scope row
can retain its declaration, but a required procedure must match v2's exact method.
Do not copy a combined thread-failure decision into both new thread scope rows.
Leave new limits and scope declarations missing until independently decided.
The new protocol revision needs its own review; a v1 review reference does not
establish that v2's extra costs or exclusions were reviewed.

Keep engineering acquisition records at their actual source versions. Preparing
v2 or copying a historical context pin does not freeze a final qualifying source,
approve old observations, or establish applicability to another source snapshot.
