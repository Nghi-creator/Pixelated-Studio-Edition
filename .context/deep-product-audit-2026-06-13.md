# Deep Product Audit Summary

Started: 2026-06-13
Trimmed: 2026-06-17

This file is now a concise project-health and remaining-proof snapshot. The old
completed-work ledger was removed because it duplicated Git history and made
future context loading noisy.

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Web frontend | Healthy | Lint, tests, production build, interaction harness, pairing recovery, submission cleanup, Local Vault, and gameplay boot/retry coverage are in place. |
| API backend | Healthy | Auth, catalog, moderation, sessions, rate limiting, access logs, local pairing, cloud sessions, and hosted smoke contracts are covered. |
| Desktop | Healthy | Build/tests, companion server, launch pairing, Docker diagnostics/recovery, release smoke, client access tracking, revoke/rotate controls are covered. |
| Engine runtime | Healthy | Build/tests, token auth, client/session revocation, local vault routes, signaling, cloud boot verification, telemetry, and process launch contracts are covered. |
| Supabase | Gated | Hosted predeploy verifies access-log schema and submission cleanup policy. |
| CI/CD | Healthy locally | `npm run verify:hosted-contract` passes locally after static interaction harness and pairing monitor fixes. |

## Remaining Environment Proof

These still require target hardware or hosted environments:

- Real two-device LAN stream and certificate UX.
- Real playable ROM local Docker/engine smoke.
- P3/P4 `/dev/uinput` behavior on target Linux host.
- Packaged installer smoke on each native OS.
- TURN relay behavior where direct/STUN connectivity fails.
- Hosted deploy workflow proof after the latest CI fixes land on `main`.

## Current Deployment Actions

Apply this Supabase migration before relying on browser-side cleanup of failed
submission uploads in production:

```txt
supabase/migrations/20260614153000_allow_own_submission_cleanup.sql
```

The hosted predeploy gate runs `check:submission-cleanup-policy` and fails with
an actionable message if the policy is missing.

## Current Guardrails

- Run `npm run verify:hosted-contract` before hosted deploy changes.
- Run `npm run predeploy:hosted` with staging secrets before schema-sensitive
  hosted deploys.
- Do not bypass GitHub deploy gates with provider auto-deploys.
- Keep smoke output out of `.context` unless explicitly preserving evidence.

## Useful Current References

- `.context/current-infrastructure.md`
- `.context/project-flows.md`
- `.context/backend-hosting-checklist.md`
- `.context/docker-onboarding-validation.md`
- `.context/lan-manual-smoke-checklist.md`
- `.context/directory-structure-audit-2026-06-14.md`
