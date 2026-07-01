# CI Rules And Tripwires

Last updated: 2026-07-02

This is the quick field guide for agents before changing code that can break
GitHub Actions. Read this before touching hosted deploys, API contracts, web
boot/session flows, desktop companion/runtime code, smoke scripts, or workflow
files.

## Workflow Map

### Hosted API Deploy Gate

File: `.github/workflows/hosted-api-deploy-gate.yml`

Runs on every pull request and as a reusable gate from hosted deploy.

- `api-contract`: installs `services/api`, then runs `npm run verify:api`.
- `hosted-contract`: installs root, web, and desktop deps; installs Chromium;
  then runs `npm run verify:hosted-contract`.
- `hosted-predeploy`: only on non-PR, non-proof runs. Requires staging secrets
  and runs `npm run predeploy:hosted`.

Local equivalents:

```bash
npm run verify:api
npm run verify:hosted-contract
```

For narrower checks:

```bash
npm --prefix services/api run typecheck
npm --prefix services/api run lint
npm --prefix services/api run test
npm --prefix services/api run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
npm --prefix apps/web run build
npm --prefix apps/desktop run test
node --check scripts/hosted/hostedAuthSmoke.mjs
node --check scripts/hosted/hostedPairingSmoke.mjs
node --check scripts/web/interactionHarnessSmoke.mjs
node scripts/hosted/hostedAuthSmoke.mjs --contract-only
node scripts/hosted/hostedPairingSmoke.mjs --contract-only
npm run test:smoke
npm run test:web-interactions
```

### Hosted Deploy

File: `.github/workflows/hosted-deploy.yml`

Runs on pushes to `main` and manual dispatch. It first calls the hosted API
deploy gate, then can trigger Render API and Vercel web deploy hooks, then runs
production hosted smokes.

Jobs after deploy:

- `hosted-pairing-smoke`: builds the desktop companion and runs
  `npm run smoke:hosted-pairing`.
- `hosted-auth-smoke`: runs `npm run smoke:hosted-auth`.

Important: local `--contract-only` smoke proves script shape and mocked
contracts only. It does not prove production timing, Render/Vercel propagation,
real Supabase auth, or real desktop companion runtime switching.

### Desktop Cross-Platform Release Validation

File: `.github/workflows/desktop-release-validation.yml`

Runs on PRs and pushes that touch:

- `.github/workflows/desktop-release-validation.yml`
- `apps/desktop/**`
- `apps/web/**`
- `engine/runtime/**`

Matrix: macOS, Windows, Ubuntu.

Each OS runs:

```bash
npm ci --prefix apps/desktop
npm ci --prefix apps/web
npm test --prefix apps/desktop
npm test --prefix apps/web
npm run dist:ci --prefix apps/desktop
```

Local equivalent for fast confidence:

```bash
npm --prefix apps/desktop run test
npm --prefix apps/web run test
npm --prefix apps/web run build
```

`npm --prefix apps/desktop run dist:ci` is the closest local equivalent, but it
is slower and platform-sensitive because it packages Electron.

## Change Risk Matrix

If you touch these files, run at least these checks before final response:

| Touched area | Minimum local checks |
| --- | --- |
| `services/api/**` | `npm run verify:api` |
| API session boot, catalog game rows, Supabase schema assumptions | `npm run verify:api` and `npm run verify:hosted-contract` |
| `apps/web/**` | `npm --prefix apps/web run lint`, `npm --prefix apps/web run test`, `npm --prefix apps/web run build` |
| WebRTC, `/engine`, pairing UI, engine context | `npm run verify:hosted-contract` |
| `apps/desktop/**` | `npm --prefix apps/desktop run test`; consider `npm --prefix apps/desktop run dist:ci` for packaging-sensitive work |
| `engine/runtime/**` | `npm --prefix apps/desktop run test`; consider desktop `dist:ci` |
| `scripts/hosted/**` or `scripts/web/**` | `node --check <script>`, contract-only smoke if available, and `npm run verify:hosted-contract` when practical |
| `.github/workflows/**` | Run the command(s) named by the edited workflow locally where possible |
| root/package lockfiles or dependency scripts | Run the affected workflow-level command, not just a package-local test |

## Known Tripwires

- Hosted pairing production smoke is timing-sensitive. Runtime switching from
  libretro to `native_linux` restarts the companion/engine path and may take
  longer in CI than a short local poll. Do not assert immediately after
  `/runtime/switch`; poll `/health` with enough time and keep the last health
  payload in failure output.
- API `POST /sessions` and `POST /sessions/:id/verify` must preserve the boot
  contract used by web and hosted smoke:
  `boot.runtimeKind`, `boot.runtimeId`, `boot.launchManifestId`, `boot.romUrl`,
  and `boot.romFilename`.
- Native Linux catalog entries have `runtime_kind = "native_linux"`,
  `runtime_id = "debian-native-v1"`, a non-empty `launch_manifest_id`, and no
  ROM artifact target. Libretro entries need ROM artifact evidence.
- The browser should not call Supabase data tables directly. The web boundary is
  `apps/web/src/lib/api/*`; backend-owned workflows should stay behind
  `services/api`.
- Hosted deploy proof mode skips production-mutating browser smokes. Passing
  proof mode is not evidence that signed-in production pairing/auth still works.
- PRs do not run staging predeploy. Staging predeploy only runs on non-PR,
  non-proof hosted gate executions and needs staging secrets.
- Desktop release validation wakes up from web changes too, because the
  packaged desktop includes the web app. A harmless web change can still break
  Electron packaging or release smoke.
- CI uses Node 22 for hosted/API workflows. Do not rely on behavior from an
  older local Node without checking.
- Lockfile changes matter. CI uses `npm ci`; if package manifests and lockfiles
  drift, CI fails even when local `npm install` works.
- Generated smoke bundles under `.context/hosted-*/*` are workflow artifacts,
  not durable project memory unless explicitly promoted. Do not commit fresh run
  output accidentally.

## Agent Checklist Before Final Response

1. Identify which workflow(s) the changed paths trigger.
2. Run the closest local workflow command, or explain clearly why it could not
   be run.
3. For hosted smoke/script changes, run `node --check` and the relevant
   `--contract-only` mode when available.
4. For production-only behavior that cannot be fully local, add diagnostics to
   failure output instead of relying on terse assertions.
5. Report exact commands run and results.

When in doubt, favor the workflow-level command:

```bash
npm run verify:api
npm run verify:hosted-contract
```

