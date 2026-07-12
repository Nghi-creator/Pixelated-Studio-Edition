import type { ChildProcess } from "child_process";

const PROCESS_OUTPUT_TAIL_BYTES = 4096;

type LaunchFailureFields = {
  exitCode?: number | null;
  label: string;
  message: string;
  runtimeId: string;
  sessionId: string;
  signal?: NodeJS.Signals | null;
  stderrTail?: string;
  stdoutTail?: string;
};

type BindManagedProcessLifecycleOptions = {
  child: ChildProcess;
  getActiveSessionId: () => string | null;
  label: string;
  onCleanupSession: (sessionId: string) => void;
  onLaunchFailure: (failure: LaunchFailureFields) => void;
  runtimeId: string;
  sessionId: string;
};

function bindProcessOutputTail(child: ChildProcess, label: string) {
  let stdoutTail = "";
  let stderrTail = "";
  const appendTail = (current: string, chunk: Buffer) =>
    (current + chunk.toString("utf8")).slice(-PROCESS_OUTPUT_TAIL_BYTES);

  child.stdout?.on("data", (data: Buffer) => {
    stdoutTail = appendTail(stdoutTail, data);
    console.log(`[${label}] ${data}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    stderrTail = appendTail(stderrTail, data);
    console.error(`[${label} Error] ${data}`);
  });

  return {
    getTail: () => ({
      ...(stderrTail ? { stderrTail } : {}),
      ...(stdoutTail ? { stdoutTail } : {}),
    }),
  };
}

export function bindManagedProcessLifecycle(
  options: BindManagedProcessLifecycleOptions,
) {
  const {
    child,
    getActiveSessionId,
    label,
    onCleanupSession,
    onLaunchFailure,
    runtimeId,
    sessionId,
  } = options;
  const output = bindProcessOutputTail(child, label);

  child.on("error", (err) => {
    console.error(`[Engine] ${label} failed to start: ${err.message}`);
    onLaunchFailure({
      label,
      message: err.message,
      runtimeId,
      sessionId,
      ...output.getTail(),
    });
    onCleanupSession(sessionId);
  });

  child.on("exit", (code, signal) => {
    if (getActiveSessionId() !== sessionId) return;
    console.log(
      `[Engine] ${label} exited for session ${sessionId}: ${
        signal ? `signal ${signal}` : `code ${code}`
      }`,
    );
    if (code !== 0 || signal) {
      onLaunchFailure({
        exitCode: code,
        label,
        message: `${label} exited unexpectedly.`,
        runtimeId,
        sessionId,
        signal,
        ...output.getTail(),
      });
    }
    onCleanupSession(sessionId);
  });
}
