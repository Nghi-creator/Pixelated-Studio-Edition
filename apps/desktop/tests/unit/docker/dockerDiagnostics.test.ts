import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyDockerFailure,
  createDockerDiagnostic,
  createDockerDiagnosticSummary,
  getDockerGuideUrl,
  getDockerGuidance,
  getDockerInstallUrl,
  getDockerResourceUrl,
  isDockerDiagnosticCode,
} from "../../../main/docker/diagnostics";

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
    assert.equal(
      classifyDockerFailure({
        stderr:
          "failed to connect to the docker API at unix:///Users/tester/.docker/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /Users/tester/.docker/run/docker.sock: connect: no such file or directory",
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

  it("selects targeted official Docker guidance", () => {
    assert.match(
      getDockerGuideUrl("permission_denied", "linux"),
      /linux-postinstall/,
    );
    assert.doesNotMatch(
      getDockerGuideUrl("permission_denied", "darwin"),
      /linux-postinstall/,
    );
    assert.match(
      getDockerGuideUrl("virtualization_unavailable", "win32"),
      /windows-install/,
    );
    assert.match(getDockerGuideUrl("disk_full", "darwin"), /disk-space/);
    assert.match(getDockerGuideUrl("context_invalid", "linux"), /context/);
    assert.equal(
      getDockerResourceUrl("install", "unknown", "darwin"),
      getDockerInstallUrl("darwin"),
    );
  });

  it("accepts only known diagnostic codes", () => {
    assert.equal(isDockerDiagnosticCode("daemon_stopped"), true);
    assert.equal(isDockerDiagnosticCode("arbitrary_url"), false);
  });

  it("provides targeted next steps for intervention-required failures", () => {
    assert.match(
      getDockerGuidance("permission_denied", "linux"),
      /Docker socket/,
    );
    assert.match(
      getDockerGuidance("virtualization_unavailable", "win32"),
      /WSL 2|Hyper-V/,
    );
    assert.match(getDockerGuidance("disk_full", "darwin"), /Free Docker disk/);
    assert.match(getDockerGuidance("context_invalid", "linux"), /context/);
  });

  it("builds a shareable summary without raw diagnostic details", () => {
    const secretDetail =
      "token=super-secret /Users/tester/private PATH=/private/bin";
    const diagnostic = createDockerDiagnostic(
      "permission_denied",
      secretDetail,
      "linux",
    );
    const summary = createDockerDiagnosticSummary("permission_denied", "linux");

    assert.equal(diagnostic.summary, summary);
    assert.match(summary, /permission_denied/);
    assert.match(summary, /Official guide:/);
    assert.doesNotMatch(summary, /super-secret|Users\/tester|private\/bin/);
  });
});
