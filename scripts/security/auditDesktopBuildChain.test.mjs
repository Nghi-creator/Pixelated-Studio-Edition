import assert from "node:assert/strict";
import test from "node:test";
import { getBlockingVulnerabilities } from "./auditDesktopBuildChain.mjs";

const advisory = {
  severity: "high",
  url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
};

test("allows the known brace expansion advisory only on development nodes", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [advisory],
      },
      minimatch: {
        nodes: ["node_modules/minimatch"],
        severity: "high",
        via: ["brace-expansion"],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/brace-expansion": { dev: true },
      "node_modules/minimatch": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), []);
});

test("blocks the allowlisted advisory if it reaches production", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [advisory],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/brace-expansion": { dev: false },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), [
    "brace-expansion",
  ]);
});

test("blocks every other high severity advisory", () => {
  const report = {
    vulnerabilities: {
      unexpected: {
        nodes: ["node_modules/unexpected"],
        severity: "high",
        via: [
          {
            severity: "high",
            url: "https://github.com/advisories/GHSA-not-allowlisted",
          },
        ],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/unexpected": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), [
    "unexpected",
  ]);
});
