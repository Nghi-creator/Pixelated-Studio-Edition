import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDockerFailure,
  createDockerDiagnostic,
  getDockerInstallUrl,
} from "../main/dockerDiagnostics";

describe("Docker diagnostic classification", () => {
  it("distinguishes missing CLI and stopped daemon failures", () => {
    assert.equal(classifyDockerFailure({ code: "ENOENT" }), "cli_missing");
    assert.equal(
      classifyDockerFailure({
        stderr: "Cannot connect to the Docker daemon. Is the docker daemon running?",
      }),
      "daemon_stopped",
    );
    assert.equal(
      classifyDockerFailure({
        stderr: "open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.",
      }),
      "daemon_stopped",
    );
  });

  it("classifies intervention-required failures", () => {
    assert.equal(
      classifyDockerFailure({
        stderr: "permission denied while trying to connect to the Docker daemon socket",
      }),
      "permission_denied",
    );
    assert.equal(
      classifyDockerFailure({ stderr: "WSL 2 installation is incomplete" }),
      "virtualization_unavailable",
    );
    assert.equal(
      classifyDockerFailure({ stderr: "no space left on device" }),
      "disk_full",
    );
    assert.equal(
      classifyDockerFailure({ stderr: "unable to resolve docker endpoint" }),
      "context_invalid",
    );
    assert.equal(
      classifyDockerFailure({ code: "ETIMEDOUT" }),
      "startup_timeout",
    );
  });

  it("falls back without mislabeling unknown failures", () => {
    assert.equal(
      classifyDockerFailure({ stderr: "unexpected daemon response" }),
      "unknown",
    );
  });
});

describe("Docker diagnostic presentation", () => {
  it("selects official install guides by platform", () => {
    assert.match(getDockerInstallUrl("darwin"), /mac-install/);
    assert.match(getDockerInstallUrl("win32"), /windows-install/);
    assert.match(getDockerInstallUrl("linux"), /engine\/install/);
  });

  it("marks stopped Docker as startable and missing Docker as install-only", () => {
    assert.equal(
      createDockerDiagnostic("daemon_stopped", "", "darwin").canStartDocker,
      true,
    );
    assert.equal(
      createDockerDiagnostic("cli_missing", "", "darwin").canStartDocker,
      false,
    );
  });
});
