import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const securityWorkflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/security-scan.yml"),
  "utf8",
);
const engineDockerfile = fs.readFileSync(
  path.join(repositoryRoot, "engine/runtime/Dockerfile"),
  "utf8",
);
const nativeEngineDockerfile = fs.readFileSync(
  path.join(repositoryRoot, "engine/runtime/Dockerfile.native"),
  "utf8",
);

test("security CI rebuilds and scans both final engine images", () => {
  assert.match(securityWorkflow, /schedule:[\s\S]*cron:/);
  assert.match(securityWorkflow, /dockerfile: engine\/runtime\/Dockerfile\n/);
  assert.match(
    securityWorkflow,
    /dockerfile: engine\/runtime\/Dockerfile\.native/,
  );
  assert.match(
    securityWorkflow,
    /anchore\/sbom-action@[0-9a-f]{40}[\s\S]*format: spdx-json/,
  );
  assert.match(
    securityWorkflow,
    /anchore\/scan-action@[0-9a-f]{40}[\s\S]*fail-build: true[\s\S]*only-fixed: true[\s\S]*severity-cutoff: high/,
  );
});

test("native emulator source refs are immutable", () => {
  assert.match(engineDockerfile, /ARG MGBA_REF=[0-9a-f]{40}/);
  assert.doesNotMatch(engineDockerfile, /ARG MGBA_REF=0\.10\.5/);
});

test("final engine images expose bounded health checks", () => {
  for (const dockerfile of [engineDockerfile, nativeEngineDockerfile]) {
    assert.match(
      dockerfile,
      /HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3/,
    );
    assert.match(dockerfile, /127\.0\.0\.1:8080\/health/);
  }
});
