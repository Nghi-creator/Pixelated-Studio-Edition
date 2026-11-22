# One-session condition recognition

`withinSessionStudy.mjs allocate CONFIG.json` prepares all plans for the core
`n11-within-session-protocol-v1` metadata contract. Use the same allocation inputs
as [studySession.mjs](STUDY_SESSION.md), plus `processor` pointing to the core
`experiments/within_session_study.py`. Its file hash must be in `dependencyFiles`.
The verification command should invoke the core condition-export verifier with
`--write-derived`. Freeze the complete relevant core dependency closure and policy.

`withinSessionStudy.mjs run CONFIG.json` accepts `directory` and `contextFile`.
Context declares the matching `host_id`, `session_id`, `session_components: 1`,
`independent_support_groups: 0`, nonempty `documented_by`, and an `observed_context`
object describing the actual observed host state. The runner records actual start
and end; no container/worker/block is promoted to an independent session.

All six fitting and six later query blocks stay one correlated host session. The
core processor inspects the new protocol, derives fitting inputs only from fitting
cases, then freezes the calibration before any query acquisition. If fitting is
unavailable, every query remains unstarted. Query scoring takes only training,
response, block and session operands; truth is joined afterward for reporting.
Any case, verification or pin failure stops the entire suffix without retry.
Existing session-start/output/attempt evidence prevents restarting the run.

Host completion markers are published atomically only after their fixed bytes are
written. Publication remains exclusive; an existing marker cannot be replaced.
The native reader still rejects malformed markers and retains its original phase
and action deadlines. A marker failure stops the cohort rather than accepting a
partial marker or retrying an acquisition.

Inspect `session-result.json`, each case's `verification-command.stdout`, the
frozen `training-fit.json`/`training-freeze.json`, and any query `prediction.json`.
Processor JSON is stored byte-for-byte, including integral-valued floats and
negative zero. Parsing and reserializing it through JavaScript can change hashed
embedded record identities. Inspect parsed metadata for control flow, but retain
the original processor bytes for fitting and prediction artifacts.
The result has one session component, zero independent support groups and no
empirical diagnosis acceptance. The original separate-session runner/validator
remain unchanged. See the core N11 within-session guide for arithmetic and limits.
