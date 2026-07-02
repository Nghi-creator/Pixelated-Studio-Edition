import assert from "node:assert/strict";
import test from "node:test";
import {
  collectDebianNativeCandidates,
  type DebianNativeLockManifest,
} from "../../src/modules/catalog/ingestion/debianNativeImporter.js";

test("Debian native importer creates review candidates from locked main/games packages", () => {
  const manifest: DebianNativeLockManifest = {
    component: "main",
    distribution: "debian",
    packages: [
      {
        args: ["--fullscreen"],
        executable: "/usr/games/frozen-bubble",
        licenseUrl:
          "https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright",
        manifestId: "frozen-bubble",
        packageName: "frozen-bubble",
        packageUrl: "https://packages.debian.org/trixie/frozen-bubble",
        packageVersion: "2.212-13+b1",
        sourcePackageName: "frozen-bubble",
        sourcePackageVersion: "2.212-13",
        sourceUrl: "https://tracker.debian.org/pkg/frozen-bubble",
        title: "Frozen-Bubble",
      },
    ],
    runtimeId: "debian-native-v1",
    schemaVersion: 1,
    section: "games",
    suite: "trixie",
  };

  const [candidate] = collectDebianNativeCandidates(manifest);

  assert.equal(candidate.sourceKind, "debian_main_games");
  assert.equal(candidate.runtimeId, "debian-native-v1");
  assert.equal(candidate.platformId, "linux");
  assert.equal(candidate.launchManifestId, "frozen-bubble");
  assert.equal(candidate.packageComponent, "main");
  assert.equal(candidate.packageName, "frozen-bubble");
  assert.equal(candidate.codeLicenseSpdx, "Debian-main");
  assert.equal(candidate.nonCommercialHostingAllowed, true);
  assert.equal(
    candidate.permissionEvidenceUrl,
    "https://metadata.ftp-master.debian.org/changelogs/main/f/frozen-bubble/frozen-bubble_2.212-13_copyright",
  );
  assert.match(candidate.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(candidate.attributionText, /Copyright evidence/);
});
