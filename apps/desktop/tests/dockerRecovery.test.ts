import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDockerDiagnostic } from "../main/dockerDiagnostics";
import {
  discoverDockerStartPlan,
  getTrustedDockerDesktopCandidates,
  waitForDockerReady,
} from "../main/dockerRecovery";

describe("Docker Desktop trusted startup plans", () => {
  it("uses only known macOS and Windows locations", () => {
    assert.deepEqual(
      getTrustedDockerDesktopCandidates("darwin", "/Users/tester", {}),
      ["/Applications/Docker.app", "/Users/tester/Applications/Docker.app"],
    );
    assert.deepEqual(
      getTrustedDockerDesktopCandidates("win32", "C:\\Users\\tester", {
        ProgramFiles: "C:\\Program Files",
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
      }),
      [
        "C:\\Program Files/Docker/Docker/Docker Desktop.exe",
        "C:\\Users\\tester\\AppData\\Local/Docker/Docker Desktop.exe",
      ],
    );
  });

  it("discovers an installed trusted app or supported Linux user service", () => {
    assert.deepEqual(
      discoverDockerStartPlan(
        "darwin",
        (candidate) => candidate === "/Applications/Docker.app",
        "/Users/tester",
        {},
      ),
      { kind: "open-path", path: "/Applications/Docker.app" },
    );
    assert.deepEqual(
      discoverDockerStartPlan(
        "linux",
        (candidate) => candidate === "/usr/bin/systemctl",
        "/home/tester",
        {},
      ),
      {
        args: ["--user", "start", "docker-desktop"],
        command: "/usr/bin/systemctl",
        kind: "exec-file",
      },
    );
  });
});

describe("Docker readiness waiting", () => {
  it("resolves once Docker becomes ready", async () => {
    const results = [
      createDockerDiagnostic("daemon_stopped"),
      createDockerDiagnostic("ready"),
    ];
    const diagnostic = await waitForDockerReady(
      {},
      {
        diagnose: async () => results.shift() || createDockerDiagnostic("ready"),
        sleep: async () => undefined,
      },
    );

    assert.equal(diagnostic.code, "ready");
  });

  it("supports cancellation and bounded timeout", async () => {
    assert.match(
      (
        await waitForDockerReady(
          {},
          {
            isCancelled: () => true,
          },
        )
      ).detail,
      /Cancelled/,
    );
    assert.equal(
      (
        await waitForDockerReady(
          {},
          {
            timeoutMs: 0,
          },
        )
      ).code,
      "startup_timeout",
    );
  });
});
