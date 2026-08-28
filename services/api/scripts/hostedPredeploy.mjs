import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["hosted access-log schema", "check:access-log-schema"],
  ["hosted submission storage policies", "check:submission-cleanup-policy"],
  ["hosted catalog RPC boundary", "check:catalog-rpc"],
  ["catalog candidate imports", "check:catalog-candidate-imports"],
  ["API typecheck", "typecheck"],
  ["API lint", "lint"],
  ["API build", "build"],
];

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const failures = [];

for (const [label, script] of checks) {
  console.log(`\n=== Hosted predeploy: ${label} ===`);
  const result = spawnSync(npmCommand, ["run", script], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    failures.push(`${label}: ${result.error.message}`);
    continue;
  }
  if (result.status !== 0) {
    failures.push(`${label}: exit ${result.status ?? "unknown"}`);
  }
}

if (failures.length > 0) {
  console.error("\nHosted predeploy failed checks:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nHosted predeploy gate passed all checks.");
