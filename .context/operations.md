# Verification, Deployment, and Smoke Operations

Last reviewed: 2026-07-22

Use this as the cross-package operational runbook. Package-specific setup and
environment variables remain in each package README.

## Local Gates

| Changed area | Minimum verification |
| --- | --- |
| `services/api/**` | `npm run verify:api` |
| API session/catalog/shared Supabase contract | `npm run verify:api` and `npm run verify:hosted-contract` |
| `apps/web/**` | web lint, test, and build |
| Pairing, `/engine`, WebRTC, or hosted web boot | `npm run verify:hosted-contract` |
| `apps/desktop/**` | desktop test; use `dist:ci` for packaging-sensitive work |
| `engine/runtime/**` | engine test and desktop test |
| hosted/web smoke scripts | `node --check`, smoke unit tests, and contract-only mode |
| workflows or lockfiles | Run the workflow-level command that consumes them |

Common commands:

```sh
npm run lint
npm test
npm run build
npm run verify:api
npm run verify:hosted-contract
npm --prefix apps/desktop run dist:ci
```

## GitHub Actions

- `hosted-api-deploy-gate.yml` runs API and hosted contracts and can run
  staging predeploy checks when secrets are available.
- `hosted-deploy.yml` gates Render/Vercel deploy hooks, waits for new targets,
  then runs production pairing and auth smokes.
- `desktop-release-validation.yml` packages and tests macOS, Windows, and Linux
  desktop artifacts.
- `security-scan.yml` audits production dependency trees and the complete
  packaged desktop runtime/build chain.

Local contract-only smoke does not prove production propagation timing, real
Supabase auth, browser/device behavior, or desktop runtime switching.

When a branch or PR is already pushed, inspect the actual pipeline after local
verification:

```sh
gh pr checks --watch
gh run list --branch "$(git branch --show-current)" --limit 5
gh run view <run-id> --log-failed
```

## Hosted Deployment

Production must use `NODE_ENV=production`, bind the API to `0.0.0.0`, and pass
`/ready` before deploy continuation. Use the complete environment list in
`services/api/README.md` and never expose the Supabase service-role key or
browser-smoke ticket secret to either frontend.

Run the staging predeploy contract before hosted deployment:

```sh
STAGING_API_URL=<api-url> \
STAGING_SUPABASE_URL=<project-url> \
STAGING_SUPABASE_ANON_KEY=<anon-key> \
STAGING_SMOKE_EMAIL=<dedicated-admin-email> \
STAGING_SMOKE_PASSWORD=<password> \
STAGING_STUDIO_ORIGIN=<origin-allowed-by-api> \
npm run predeploy:hosted
```

`STAGING_STUDIO_ORIGIN` is optional when the deployed API allows the default
Studio web origin. Set the protected environment variable when staging uses a
different approved Studio origin.

Studio Edition is the shared Supabase migration authority. Apply migrations
from this repository before deploying code that depends on them. Provider
auto-deploys must not bypass the GitHub gates.

## Smoke Commands and Artifacts

| Purpose | Command | Default output |
| --- | --- | --- |
| Hosted pairing | `npm run smoke:hosted-pairing` | `.artifacts/hosted-pairing-smoke/<run-id>` |
| Hosted auth | `npm run smoke:hosted-auth` | `.artifacts/hosted-auth-smoke/<run-id>` |
| LAN multiplayer | `npm run smoke:lan` | `.artifacts/lan-smoke/<run-id>` |
| LAN summary | `npm run smoke:lan-summary -- <run-id-or-dir>` | stdout or requested path |
| Desktop package | `npm --prefix apps/desktop run smoke:release` | validates packaged release |
| Native runtime | `npm --prefix engine/runtime run smoke:native` | validates locked native image |

Generated proof and smoke output is disposable. Keep it in `.artifacts/` or a
CI artifact upload; do not commit it under `.context/`.

The two-device LAN procedure remains in `lan-manual-smoke-checklist.md`.

## Known Tripwires

- Hosted pairing is deployment-timing sensitive. Poll runtime switching and
  retain the latest health payload in failures.
- Session boot must preserve runtime kind/id, launch manifest, ROM URL, and ROM
  filename contracts across API, web, engine, and hosted smoke.
- Native builds use an allowlisted launch manifest and no ROM target; libretro
  builds require immutable ROM evidence.
- PRs do not run secret-backed staging predeploy or production browser smokes.
- Desktop packaging includes the web build, so web changes can break Electron
  release validation.
- CI uses Node 22 and `npm ci`; package/lock drift is a hard failure.
- A passing proof-mode deploy is not evidence that production auth and pairing
  work end to end.

## Desktop Release Validation Still Requiring Real Machines

Automated fixtures cover Docker diagnostics and packaging, but public release
readiness still requires:

1. Confirming the macOS, Windows, and Ubuntu release matrix.
2. Manual missing/stopped/ready Docker flows on Windows 11 + WSL 2 and Ubuntu.
3. A full macOS **Initialize Engine → Start Docker → automatic resume** run.
4. Code signing and notarization before public macOS distribution.

Record OS/app versions, observed diagnostic, recovery action, and result. Do
not mark a platform validated from classifier fixtures alone.
