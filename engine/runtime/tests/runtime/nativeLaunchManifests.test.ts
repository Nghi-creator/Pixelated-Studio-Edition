import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getNativeLaunchManifest } from "../../src/runtime/launchers/nativeLaunchManifests";
import { getRuntimeDefinition } from "../../src/runtime/runtimeRegistry";

test("debian native runtime exposes only allowlisted launch manifests", () => {
  const runtime = getRuntimeDefinition("debian-native-v1");

  assert.equal(runtime?.kind, "native_linux");
  assert.deepEqual(runtime?.launchManifestIds, ["frozen-bubble", "neverball"]);
  assert.equal(getNativeLaunchManifest("frozen-bubble")?.executable, "/usr/games/frozen-bubble");
  assert.equal(getNativeLaunchManifest("neverball")?.executable, "/usr/games/neverball");
  assert.equal(getNativeLaunchManifest("/bin/sh"), null);
});

test("native lock manifest matches allowlisted launch manifests and Docker pins", () => {
  const lockPath = path.resolve(__dirname, "../../../native-runtime.lock.json");
  const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile.native");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
    packages: {
      args: string[];
      executable: string;
      manifestId: string;
      packageName: string;
      packageVersion: string;
    }[];
  };
  const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
  const runtime = getRuntimeDefinition("debian-native-v1");

  assert.deepEqual(
    lock.packages.map((pkg) => pkg.manifestId),
    runtime?.launchManifestIds,
  );

  for (const pkg of lock.packages) {
    const manifest = getNativeLaunchManifest(pkg.manifestId);
    assert.equal(manifest?.executable, pkg.executable);
    assert.deepEqual(manifest?.args, pkg.args);
    if (pkg.packageName === "neverball") {
      assert.match(dockerfile, /amd64\) neverball_version='1\.6\.0\+git20180603-3\+b1'/);
      assert.match(
        dockerfile,
        new RegExp(
          `arm64\\) neverball_version='${pkg.packageVersion.replaceAll("+", "\\+")}'`,
        ),
      );
      assert.match(dockerfile, /"neverball=\$\{neverball_version\}"/);
      continue;
    }
    assert.match(
      dockerfile,
      new RegExp(
        `${pkg.packageName}=${pkg.packageVersion.replaceAll("+", "\\+")}`,
      ),
    );
  }
});

test("runtime images pin the Python camera WebRTC dependencies", () => {
  const dockerfilePath = path.resolve(__dirname, "../../../Dockerfile.native");
  const libretroDockerfilePath = path.resolve(__dirname, "../../../Dockerfile");
  const requirementsPath = path.resolve(
    __dirname,
    "../../../python-requirements.lock",
  );
  const smokePath = path.resolve(
    __dirname,
    "../../../scripts/smokeNativeRuntime.mjs",
  );
  const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
  const libretroDockerfile = fs.readFileSync(libretroDockerfilePath, "utf8");
  const requirements = fs.readFileSync(requirementsPath, "utf8");
  const smoke = fs.readFileSync(smokePath, "utf8");

  assert.match(dockerfile, /gir1\.2-gst-plugins-bad-1\.0/);
  assert.match(dockerfile, /gir1\.2-gst-plugins-base-1\.0/);
  assert.match(dockerfile, /debian:trixie-slim@sha256:[a-f0-9]{64}/);
  assert.match(dockerfile, /node:24\.18\.1-bookworm-slim@sha256:[a-f0-9]{64}/);
  assert.match(dockerfile, /-r \/tmp\/python-requirements\.lock/);
  assert.match(libretroDockerfile, /ubuntu:22\.04@sha256:[a-f0-9]{64}/);
  assert.match(
    libretroDockerfile,
    /node:24\.18\.1-bullseye-slim@sha256:[a-f0-9]{64}/,
  );
  assert.match(libretroDockerfile, /-r \/tmp\/python-requirements\.lock/);
  for (const source of [dockerfile, libretroDockerfile]) {
    assert.match(source, /mkdir -p [^\n]*\/run\/pixelated/);
    assert.match(source, /chown -R 10001:10001 [^\n]*\/run\/pixelated/);
    assert.match(source, /chmod 0700 \/run\/pixelated/);
  }
  for (const helper of ["camera_config.py", "camera_protocol.py", "camera_state.py"]) {
    assert.match(dockerfile, new RegExp(`COPY [^\\n]*${helper}`));
    assert.match(libretroDockerfile, new RegExp(`COPY [^\\n]*${helper}`));
  }
  assert.match(requirements, /^python-socketio==\d+\.\d+\.\d+$/m);
  for (const requirement of requirements
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))) {
    assert.match(requirement, /^[a-z0-9-]+==[a-zA-Z0-9.]+$/);
  }
  assert.match(dockerfile, /PYTHONPATH=\/usr\/local\/lib\/pixelated-python/);
  assert.match(smoke, /GstWebRTC/);
  assert.match(smoke, /GstSdp/);
});
