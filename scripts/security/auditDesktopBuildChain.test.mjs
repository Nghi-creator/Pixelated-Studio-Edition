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

test("allows GitHub URL context on the known development-only advisory", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [
          {
            ...advisory,
            url: `${advisory.url}/dependabot?query=scope%3Adevelopment`,
          },
        ],
      },
      glob: {
        nodes: ["node_modules/glob"],
        severity: "high",
        via: ["brace-expansion"],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/brace-expansion": { dev: true },
      "node_modules/glob": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), []);
});

test("follows npm reverse effects when a meta-vulnerability omits via", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        effects: ["minimatch"],
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [advisory],
      },
      minimatch: {
        effects: ["glob"],
        nodes: ["node_modules/minimatch"],
        severity: "high",
        via: [],
      },
      glob: {
        nodes: ["node_modules/glob"],
        severity: "high",
        via: [],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/brace-expansion": { dev: true },
      "node_modules/minimatch": { dev: true },
      "node_modules/glob": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), []);
});

test("allows detached npm meta-vulnerabilities when every direct leaf is known", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [advisory],
      },
      glob: {
        nodes: ["node_modules/glob"],
        severity: "high",
        via: [],
      },
      "electron-builder": {
        nodes: ["node_modules/electron-builder"],
        severity: "high",
        via: [],
      },
    },
  };
  const packageLock = {
    packages: {
      "node_modules/brace-expansion": { dev: true },
      "node_modules/glob": { dev: true },
      "node_modules/electron-builder": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), []);
});

test("does not use reverse effects to allow an unknown direct advisory", () => {
  const report = {
    vulnerabilities: {
      "brace-expansion": {
        effects: ["glob"],
        nodes: ["node_modules/brace-expansion"],
        severity: "high",
        via: [advisory],
      },
      glob: {
        nodes: ["node_modules/glob"],
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
      "node_modules/brace-expansion": { dev: true },
      "node_modules/glob": { dev: true },
    },
  };

  assert.deepEqual(getBlockingVulnerabilities(report, packageLock), ["glob"]);
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
