import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageJson;

test("hosted predeploy fails fast on missing submission cleanup storage policy", () => {
  const scripts = packageJson.scripts || {};

  assert.match(
    scripts["check:submission-cleanup-policy"] || "",
    /--submission-cleanup-policy-only/,
  );
  assert.match(
    scripts["predeploy:hosted"] || "",
    /check:access-log-schema && npm run check:submission-cleanup-policy && npm run typecheck/,
  );
});
