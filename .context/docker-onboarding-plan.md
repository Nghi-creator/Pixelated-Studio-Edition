# Docker Onboarding And Recovery Plan

Last reviewed: 2026-06-13

## Goal

Make Pixelated Studio engine initialization understandable and low-friction for
users who do not already know how to install, start, or troubleshoot Docker.

The desktop app should diagnose the user's Docker state, offer the safest useful
action for the current operating system, wait for Docker to become ready, and
continue engine initialization automatically.

Docker remains an external prerequisite in this plan. Pixelated Studio will not
silently install Docker, bundle Docker Desktop, bypass operating-system security,
or request administrator privileges without an explicit user action.

## Current Behavior

The desktop engine startup currently:

1. Runs a bounded `docker info` diagnostic before engine startup.
2. Classifies missing CLI, stopped daemon, permission, virtualization, disk,
   context, timeout, and unknown failures.
3. Sends a structured diagnostic payload to the renderer and preserves the
   technical detail in System Logs.
4. Shows targeted failure text, then lets the user retry with the existing
   Initialize Engine action.
5. Still requires the user to perform recovery outside Pixelated Studio.

Relevant current files:

- `apps/desktop/main/engineController.ts`
- `apps/desktop/main/docker.ts`
- `apps/desktop/main/state.ts`
- `apps/desktop/main.ts`
- `apps/desktop/preload.ts`
- `apps/desktop/renderer.ts`
- `apps/desktop/renderer/phases.ts`
- `apps/desktop/index.html`

## Product Principles

- Explain the problem in user language, while preserving technical details in
  logs and diagnostics.
- Prefer safe actions such as opening Docker Desktop or an official download
  page over running platform installers.
- Never execute downloaded scripts or package-manager install commands
  automatically.
- Continue initialization automatically after Docker becomes ready.
- Keep Initialize Engine as the main action; recovery actions should appear only
  when needed.
- Keep behavior useful when the machine is offline.
- Avoid claiming Docker is missing when it is installed but unavailable.
- Make Linux guidance distribution-aware where possible, but do not pretend one
  Linux startup/install command works everywhere.

## Target User Flow

### Docker Ready

1. User clicks **Initialize Engine**.
2. Pixelated Studio checks Docker CLI and daemon readiness.
3. Startup continues normally.

### Docker Installed But Stopped

1. User clicks **Initialize Engine**.
2. Pixelated Studio identifies that Docker is installed but the daemon is not
   ready.
3. The Docker check phase shows **Docker is installed but not running**.
4. A **Start Docker** action appears.
5. Pixelated Studio starts Docker Desktop using an OS-specific trusted path.
6. The UI shows **Waiting for Docker** and polls readiness.
7. Engine initialization resumes automatically once `docker info` succeeds.

### Docker Missing

1. User clicks **Initialize Engine**.
2. Pixelated Studio identifies that no usable Docker CLI/install is present.
3. The Docker check phase shows **Docker is not installed**.
4. Actions appear:
   - **Download Docker**
   - **Retry**
   - **View setup guide**
5. **Download Docker** opens the official platform-specific Docker page in the
   system browser.
6. After installation, the user returns and presses **Retry**.

### Docker Requires User Intervention

Examples:

- Linux daemon socket permission denied.
- Docker Desktop startup timed out.
- Virtualization/WSL 2 is unavailable.
- Docker daemon reports insufficient disk space.
- Docker context or socket is invalid.

The UI should show a targeted explanation and a **View setup guide** or
**Open Docker Desktop** action when applicable. Technical command output remains
available in System Logs.

## Cross-Platform Behavior

### macOS

Detection:

- Check whether `docker` exists on the safe PATH.
- Check common Docker Desktop application locations:
  - `/Applications/Docker.app`
  - `~/Applications/Docker.app`
- Run `docker info` to distinguish CLI availability from daemon readiness.

Start action:

- Use Electron `shell.openPath()` or macOS `open -a Docker`.
- Prefer Electron APIs where possible to avoid shell quoting issues.

Install action:

- Open Docker's official macOS installation page.
- Do not download or mount the DMG automatically in the first implementation.

### Windows

Detection:

- Check whether `docker.exe` exists on PATH.
- Check common Docker Desktop installation paths under `Program Files`.
- Run `docker info`.
- Detect common WSL 2/virtualization-related failure text.

Start action:

- Launch Docker Desktop from its known executable path.
- Do not start arbitrary executables discovered from untrusted paths.

Install action:

- Open Docker's official Windows installation page.
- Explain WSL 2/virtualization requirements when relevant.

### Linux

Detection:

- Check whether `docker` exists on PATH.
- Run `docker info`.
- Classify socket/permission errors separately.
- Detect whether `systemctl` and Docker Desktop are available.

Start action:

- If Docker Desktop is installed and a user service exists, offer a guided
  start action.
- If system Docker Engine requires root/system service access, show the exact
  command or guide instead of silently invoking `sudo`.

Install action:

- Open Docker's official Linux installation page.
- Do not choose a distribution package command automatically in the first
  implementation.

## Proposed Architecture

### Docker Diagnostic Module

Add `apps/desktop/main/dockerDiagnostics.ts`.

Suggested types:

```ts
type DockerDiagnosticCode =
  | "ready"
  | "cli_missing"
  | "daemon_stopped"
  | "permission_denied"
  | "virtualization_unavailable"
  | "disk_full"
  | "context_invalid"
  | "startup_timeout"
  | "unknown";

type DockerDiagnostic = {
  code: DockerDiagnosticCode;
  detail: string;
  dockerDesktopPath?: string;
  installUrl: string;
  canStartDocker: boolean;
  platform: NodeJS.Platform;
};
```

Responsibilities:

- Discover trusted Docker CLI/Desktop paths.
- Run bounded diagnostic commands.
- Classify stderr/error messages.
- Return structured data instead of user-facing HTML.
- Keep platform branching out of `engineController.ts`.

### Docker Recovery Controller

Add recovery functions near the diagnostic module:

- `diagnoseDocker()`
- `startDockerApplication()`
- `waitForDockerReady()`
- `getDockerInstallUrl()`

Safety constraints:

- Only launch known Docker Desktop application/executable paths.
- Never interpolate user input into shell commands.
- Never invoke `sudo`.
- Apply timeouts to every diagnostic/startup wait.
- Stop polling when the desktop window closes or a new startup attempt begins.

### IPC Contract

Add explicit IPC actions:

- `diagnose-docker`
- `start-docker-application`
- `open-docker-install`
- `retry-engine-start`

Suggested renderer payload:

```ts
type DockerRecoveryPayload = {
  code: DockerDiagnosticCode;
  detail: string;
  canStartDocker: boolean;
  installUrl: string;
  title: string;
};
```

Do not overload the current `start-docker` event with recovery behavior until
the diagnostic module is tested.

### UI

Add a Docker recovery callout near the startup pipeline, visible only when the
Docker phase needs user action.

Possible actions:

- **Start Docker**
- **Download Docker**
- **Retry**
- **View setup guide**

During automatic startup waiting:

- Keep Initialize Engine disabled.
- Show spinner.
- Show status badge detail such as **Waiting for Docker Desktop**.
- Allow cancellation if startup waiting becomes lengthy.

When Docker becomes ready:

- Hide the recovery callout.
- Resume the original engine initialization attempt automatically.

## Diagnostic Classification

Initial classifier should recognize:

- Command-not-found / `ENOENT` → `cli_missing`
- Cannot connect to Docker daemon / named pipe unavailable → `daemon_stopped`
- Permission denied on Docker socket → `permission_denied`
- WSL 2 / virtualization unavailable text → `virtualization_unavailable`
- No space left / disk usage failure → `disk_full`
- Invalid/current Docker context failures → `context_invalid`
- Polling deadline exceeded → `startup_timeout`
- Everything else → `unknown`

Each classification needs fixture-based tests using representative stderr from
macOS, Windows, and Linux.

## Implementation Phases

### Phase 0: Baseline And Contracts

Status: Implemented on 2026-06-13.

Goal: preserve current startup behavior while establishing testable contracts.

Steps:

1. Document current `docker info` failure behavior.
2. Add diagnostic/result TypeScript types.
3. Add fixture-based classifier tests for the initial diagnostic codes.
4. Add command timeouts to Docker diagnostics.

Exit criteria:

- Current successful engine startup is unchanged.
- Known Docker failures classify consistently in unit tests.

### Phase 1: Diagnose Before Failure

Status: Implemented on 2026-06-13.

Goal: replace the generic Docker error with structured diagnosis.

Steps:

1. Add `dockerDiagnostics.ts`.
2. Replace the raw `docker info` callback in `engineController.ts`.
3. Emit a Docker recovery payload to the renderer on failure.
4. Preserve full diagnostic details in System Logs.
5. Show targeted user-facing failure text.

Exit criteria:

- Missing CLI and stopped daemon produce different UI messages.
- Permission failures no longer look like a stopped daemon.
- Existing desktop tests and packaged release smoke pass.

### Phase 2: Guided Install And Retry

Status: Implemented on 2026-06-13.

Goal: help users install Docker safely.

Steps:

1. Add **Download Docker**, **Retry**, and **View setup guide** actions.
2. Open official Docker URLs through Electron `shell.openExternal()`.
3. Add platform-specific guidance to the desktop docs modal and README.
4. Ensure offline/open-browser failures produce useful messages.

Exit criteria:

- Download action opens the correct official page for each supported OS.
- Retry reruns diagnosis without restarting Pixelated Studio.
- No installer is downloaded or executed automatically.

### Phase 3: Start Docker Desktop And Auto-Resume

Status: Implemented on 2026-06-13.

Goal: reduce the common installed-but-stopped case to one click.

Steps:

1. Discover trusted Docker Desktop paths.
2. Add **Start Docker** for macOS and Windows.
3. Add supported Linux Docker Desktop user-service start where reliably
   detectable.
4. Poll `docker info` with cancellation and a bounded timeout.
5. Automatically resume the original engine start after readiness.

Exit criteria:

- Starting a stopped Docker Desktop requires one user action.
- UI clearly displays waiting/progress/timeout states.
- Engine initialization resumes once, without duplicate startup attempts.

### Phase 4: Targeted Recovery Guidance

Goal: make non-happy-path failures actionable.

Steps:

1. Add permission-denied guidance for Linux Docker sockets/groups.
2. Add WSL 2/virtualization guidance for Windows.
3. Add disk-space and Docker-context guidance.
4. Add a copyable diagnostics summary that excludes secrets.

Exit criteria:

- Common intervention-required failures show a targeted next step.
- Diagnostics can be shared without leaking tokens or environment secrets.

### Phase 5: Cross-Platform Release Validation

Goal: prove the workflow outside the development Mac.

Required smoke matrix:

| Platform | Docker missing | Docker stopped | Docker ready | Permission/config failure |
| --- | --- | --- | --- | --- |
| macOS Apple Silicon | Required | Required | Required | Best effort |
| macOS Intel | Best effort | Best effort | Required | Best effort |
| Windows 11 + WSL 2 | Required | Required | Required | Required |
| Ubuntu LTS | Required | Required | Required | Required |

Release checks:

- Desktop unit tests.
- Packaged preload/IPC smoke.
- Packaged macOS DMG test.
- Windows installer smoke.
- Linux AppImage smoke.

Exit criteria:

- Supported actions behave consistently across the required matrix.
- Unsupported recovery actions fall back to accurate documentation.

## Testing Strategy

### Unit Tests

- Classifier fixtures for each diagnostic code and OS.
- Trusted Docker Desktop path selection.
- Install URL selection.
- Polling success, timeout, cancellation, and duplicate-start prevention.
- IPC payload validation.

### Integration Tests

- Mock command runner for missing/stopped/ready Docker transitions.
- Renderer recovery callout action visibility.
- Automatic resume after a stopped-to-ready transition.
- No engine token/container startup before Docker readiness.

### Manual Tests

- Docker Desktop fully quit, then **Start Docker**.
- Docker Desktop absent, then **Download Docker**.
- Docker daemon unavailable after timeout.
- Linux permission-denied socket.
- Windows WSL/virtualization failure.
- Offline machine attempting **Download Docker**.

## Rollout And Guardrails

- Ship diagnostic-only behavior first.
- Add install links second.
- Add one-click Docker startup only after diagnostic classification is stable.
- Keep the existing generic failure fallback for unknown errors.
- Record only diagnostic categories and durations, never raw environment values,
  tokens, or full filesystem paths in hosted telemetry.
- Do not block experienced users from starting Docker manually and pressing
  **Retry**.

## Completed Deployment Steps

Phases 0 through 2 now provide:

1. Add structured Docker diagnosis.
2. Distinguish missing, stopped, permission, and unknown failures.
3. Show targeted messages and allow retry through Initialize Engine or the
   recovery callout.
4. Open official Docker install and diagnosis-specific setup pages through
   main-process-owned URL selection.

Phase 3 adds trusted Docker Desktop launching, bounded readiness polling,
cancellation, duplicate-start prevention, and automatic engine initialization
resume without changing the diagnostic contract.
