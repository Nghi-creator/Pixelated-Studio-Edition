# Repository conventions

Commit subjects use `[type] summary`, for example `[fix] correct counter sampling`,
`[feature] add a scenario adapter`, or `[docs] update runtime acceptance`.
Follow the existing bracket prefixes for other change types.

# Documentation scope

Keep `docs/` focused on project behavior, contracts, APIs, setup and reusable
contributor/operator procedures. Put personal plans, progress ledgers, audit
writeups and session-specific verification receipts in gitignored `local/`.
Do not add a public writeup for every audit.

# Agent workflow

- For non-trivial bugs and unexpected runtime failures, use the `diagnosing-bugs` skill when available. Reproduce and isolate the failure before making changes.
- Use `tdd` for well-specified implementation changes with clear test boundaries. Do not force TDD on exploratory runtime measurements or trivial edits.
- Use `handoff` when explicitly requested to transfer unfinished work to a new session. Reference existing documentation, plans, and evidence rather than duplicating them.
- Prefer focused tests and synthetic fixtures before expensive live or container-based runs. Run broader integration checks when changes warrant them.
- Preserve raw telemetry, source identities, acquisition records, and failed-run evidence. Never silently rewrite historical experimental artifacts.
- Do not weaken instrumentation, ownership, restoration, or cleanup checks to make a run pass.
- Distinguish successful software execution from valid measurement, verified restoration, and scientific acceptance.
- For changes affecting exported research data, verify compatibility with the latency_fingerprinting consumer and its versioned measurement contracts.
- Report tests executed, runtime conditions, observed results, and remaining limitations. Do not claim live verification from mocks or synthetic tests.